#!/usr/bin/env bash
# ==============================================================================
# JOBIEST INFRASTRUCTURE — GATE 0 PURELY READ-ONLY OCI DISCOVERY & STATE AUDIT
# ==============================================================================
# Performs 100% read-only OCI control-plane queries (get / list ONLY).
# Zero mutations, zero launches, zero attachments, zero secret output.
# ==============================================================================

set -euo pipefail
export OCI_CLI_SUPPRESS_FILE_PERMISSIONS_WARNING=True

REGION="${OCI_REGION:-us-chicago-1}"
TENANCY_ID="${OCI_TENANCY:-$(awk -F= '/^[[:space:]]*tenancy[[:space:]]*=/{gsub(/[[:space:]]/,"",$2); print $2; exit}' "$HOME/.oci/config")}"

printf -- '=== 1. TENANCY & REGION ===\n'
oci iam tenancy get --tenancy-id "$TENANCY_ID" --query 'data.{id:id,name:name,home:"home-region-key"}' --output table

printf -- '\n=== 2. AVAILABILITY DOMAINS & FAULT DOMAINS ===\n'
ADS="$(oci iam availability-domain list --region "$REGION" --compartment-id "$TENANCY_ID" --query 'data[].name' --raw-output | tr -d '[]",' | tr '\n' ' ')"
for ad in $ADS; do
  printf -- 'AD: %s\n' "$ad"
  oci iam fault-domain list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --query 'data[].{name:name,id:id}' --output table
done

printf -- '\n=== 3. COMPUTE INSTANCES, CONSOLE CONNECTIONS & ARM64 UBUNTU IMAGE ===\n'
oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,state:"lifecycle-state",shape:shape,ad:"availability-domain",fd:"fault-domain",ocpus:"shape-config".ocpus,mem:"shape-config"."memory-in-gbs",created:"time-created"}' --output table
oci compute instance-console-connection list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{id:id,instance:"instance-id",state:"lifecycle-state"}' --output table
oci compute image list --region "$REGION" --compartment-id "$TENANCY_ID" \
  --operating-system "Canonical Ubuntu" --operating-system-version "24.04" --shape "VM.Standard.A1.Flex" \
  --sort-by TIMECREATED --sort-order DESC \
  --query 'data[0].{name:"display-name",id:id,created:"time-created"}' --output table

printf -- '\n=== 4. ALWAYS FREE COMPUTE, STORAGE & NETWORK QUOTA AVAILABILITY ===\n'
for ad in $ADS; do
  printf -- '--- Quotas in %s ---\n' "$ad"
  for lim in standard-a1-core-count standard-a1-memory-count standard-e2-micro-core-count standard-e5-core-count standard-e5-memory-count; do
    AV="$(oci limits resource-availability get --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --limit-name "$lim" --availability-domain "$ad" --query 'data.{used:used,avail:available}' 2>/dev/null || echo '{}')"
    printf -- '  %-32s : %s\n' "$lim" "$(printf -- '%s' "$AV" | tr -d '\n ')"
  done
done
printf -- '--- Regional Quotas (%s) ---\n' "$REGION"
for svc_lim in \
  "compute:standard-a1-core-regional-count" \
  "compute:standard-a1-memory-regional-count" \
  "block-storage:total-storage-gb" \
  "block-storage:total-free-storage-gb" \
  "block-storage:free-backup-count" \
  "vcn:reserved-public-ip-count"; do
  svc="${svc_lim%%:*}"
  lim="${svc_lim#*:}"
  AV="$(oci limits resource-availability get --region "$REGION" --compartment-id "$TENANCY_ID" --service-name "$svc" --limit-name "$lim" --query 'data.{used:used,avail:available}' 2>/dev/null || echo '{}')"
  printf -- '  %-40s : %s\n' "$svc_lim" "$(printf -- '%s' "$AV" | tr -d '\n ')"
done

printf -- '\n=== 5. BOOT VOLUMES, BLOCK VOLUMES, ATTACHMENTS & BACKUPS ===\n'
for ad in $ADS; do
  printf -- '--- Volumes & Attachments in %s ---\n' "$ad"
  oci bv boot-volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all \
    --query 'data[].{name:"display-name",id:id,size_gb:"size-in-gbs",vpus:"vpus-per-gb",state:"lifecycle-state"}' --output table
  oci bv volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all \
    --query 'data[].{name:"display-name",id:id,size_gb:"size-in-gbs",state:"lifecycle-state"}' --output table
  oci compute boot-volume-attachment list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all \
    --query 'data[].{id:id,instance:"instance-id",boot_vol:"boot-volume-id",state:"lifecycle-state"}' --output table
  oci compute volume-attachment list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all \
    --query 'data[].{id:id,instance:"instance-id",vol:"volume-id",ro:"is-read-only",state:"lifecycle-state"}' --output table
done
oci bv boot-volume-backup list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,boot_vol:"boot-volume-id",type:type,size_gb:"size-in-gbs",unique_gb:"unique-size-in-gbs",state:"lifecycle-state",created:"time-created"}' --output table
oci bv backup list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,state:"lifecycle-state",created:"time-created"}' --output table

printf -- '\n=== 6. VCN, SUBNETS, VNICS, ROUTE TABLES, IGWS, SECURITY LISTS, NSGS & PUBLIC IPS ===\n'
oci network vcn list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,cidr:"cidr-block",dns:"dns-label",state:"lifecycle-state"}' --output table
oci network subnet list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,cidr:"cidr-block",no_pub:"prohibit-public-ip-on-vnic",rt:"route-table-id",sls:"security-list-ids"}'
oci compute vnic-attachment list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{instance:"instance-id",vnic:"vnic-id",subnet:"subnet-id",state:"lifecycle-state"}' --output table
oci network route-table list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,rules:"route-rules"}'
oci network internet-gateway list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,enabled:"is-enabled",state:"lifecycle-state"}' --output table
oci network security-list list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,ingress:"ingress-security-rules",egress:"egress-security-rules"}'
oci network nsg list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,state:"lifecycle-state"}' --output table
oci network public-ip list --region "$REGION" --compartment-id "$TENANCY_ID" --scope REGION --all \
  --query 'data[].{name:"display-name",ip:"ip-address",id:id,lifetime:lifetime,state:"lifecycle-state",assigned:"assigned-entity-id"}' --output table

printf -- '\n=== 7. OBJECT STORAGE BUCKETS, OBJECT METADATA, PARS & IAM POLICIES ===\n'
NS="$(oci os ns get --region "$REGION" --query 'data' --raw-output)"
oci os bucket list --region "$REGION" --compartment-id "$TENANCY_ID" --namespace-name "$NS" --all \
  --query 'data[].{name:name,created:"time-created"}' --output table
if oci os bucket get --region "$REGION" --namespace-name "$NS" --bucket-name "jobiest-gate2-vault" >/dev/null 2>&1; then
  oci os bucket get --region "$REGION" --namespace-name "$NS" --bucket-name "jobiest-gate2-vault" \
    --query 'data.{name:name,public:"public-access-type",tier:"storage-tier",approx_bytes:"approximate-size",approx_count:"approximate-count"}'
  oci os object list --region "$REGION" --namespace-name "$NS" --bucket-name "jobiest-gate2-vault" --all \
    --query 'data[].{name:name,size:size,created:"time-created"}' --output table
  oci os preauth-request list --region "$REGION" --namespace-name "$NS" --bucket-name "jobiest-gate2-vault" --all \
    --query 'data[].{id:id,name:name,access:"access-type",expires:"time-expires"}' --output table
fi
oci iam dynamic-group list --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:name,id:id,rule:"matching-rule",state:"lifecycle-state"}' --output table
oci iam policy list --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:name,id:id,statements:statements}'

printf -- '\n=== GATE 0 READ-ONLY DISCOVERY COMPLETE (ZERO MUTATIONS) ===\n'
