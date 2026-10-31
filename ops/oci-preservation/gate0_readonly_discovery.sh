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

printf '=== 1. TENANCY & REGION ===\n'
oci iam tenancy get --tenancy-id "$TENANCY_ID" --query 'data.{id:id,name:name,home:"home-region-key"}' --output table

printf '\n=== 2. AVAILABILITY DOMAINS & FAULT DOMAINS ===\n'
ADS="$(oci iam availability-domain list --region "$REGION" --compartment-id "$TENANCY_ID" --query 'data[].name' --raw-output | tr -d '[]",' | tr '\n' ' ')"
for ad in $ADS; do
  printf 'AD: %s\n' "$ad"
  oci iam fault-domain list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --query 'data[].{name:name,id:id}' --output table
done

printf '\n=== 3. COMPUTE INSTANCES & CONSOLE CONNECTIONS ===\n'
oci compute instance list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,state:"lifecycle-state",shape:shape,ad:"availability-domain",fd:"fault-domain",ocpus:"shape-config".ocpus,mem:"shape-config"."memory-in-gbs",created:"time-created"}' --output table
oci compute instance-console-connection list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{id:id,instance:"instance-id",state:"lifecycle-state"}' --output table

printf '\n=== 4. ALWAYS FREE COMPUTE & STORAGE QUOTA AVAILABILITY ===\n'
for ad in $ADS; do
  printf '--- Quotas in %s ---\n' "$ad"
  for lim in standard-a1-core-count standard-a1-memory-count standard-e2-micro-core-count; do
    AV="$(oci limits resource-availability get --region "$REGION" --compartment-id "$TENANCY_ID" --service-name compute --limit-name "$lim" --availability-domain "$ad" --query 'data.{used:used,avail:available}' 2>/dev/null || echo '{}')"
    printf '  %-32s : %s\n' "$lim" "$(echo "$AV" | tr -d '\n ')"
  done
done

printf '\n=== 5. BOOT VOLUMES, BLOCK VOLUMES & BACKUPS ===\n'
for ad in $ADS; do
  printf '--- Volumes in %s ---\n' "$ad"
  oci bv boot-volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all \
    --query 'data[].{name:"display-name",id:id,size_gb:"size-in-gbs",vpus:"vpus-per-gb",state:"lifecycle-state"}' --output table
  oci bv volume list --region "$REGION" --compartment-id "$TENANCY_ID" --availability-domain "$ad" --all \
    --query 'data[].{name:"display-name",id:id,size_gb:"size-in-gbs",state:"lifecycle-state"}' --output table
done
oci bv boot-volume-backup list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,type:type,size_gb:"size-in-gbs",unique_gb:"unique-size-in-gbs",state:"lifecycle-state",created:"time-created"}' --output table
oci bv backup list --region "$REGION" --compartment-id "$TENANCY_ID" --all \
  --query 'data[].{name:"display-name",id:id,state:"lifecycle-state",created:"time-created"}' --output table

printf '\n=== 6. VCN, SUBNETS, ROUTE TABLES, IGWS, SECURITY LISTS, NSGS & RESERVED IPS ===\n'
oci network vcn list --region "$REGION" --compartment-id "$TENANCY_ID" --all --query 'data[].{name:"display-name",id:id,cidr:"cidr-block",state:"lifecycle-state"}' --output table
oci network subnet list --region "$REGION" --compartment-id "$TENANCY_ID" --all --query 'data[].{name:"display-name",id:id,cidr:"cidr-block",rt:"route-table-id",sls:"security-list-ids"}' --output table
oci network route-table list --region "$REGION" --compartment-id "$TENANCY_ID" --all --query 'data[].{name:"display-name",id:id,rules:"route-rules"}'
oci network internet-gateway list --region "$REGION" --compartment-id "$TENANCY_ID" --all --query 'data[].{name:"display-name",id:id,enabled:"is-enabled",state:"lifecycle-state"}' --output table
oci network security-list list --region "$REGION" --compartment-id "$TENANCY_ID" --all --query 'data[].{name:"display-name",id:id,ingress:"ingress-security-rules",egress:"egress-security-rules"}'
oci network nsg list --region "$REGION" --compartment-id "$TENANCY_ID" --all --query 'data[].{name:"display-name",id:id,state:"lifecycle-state"}' --output table
oci network public-ip list --region "$REGION" --compartment-id "$TENANCY_ID" --scope REGION --all \
  --query 'data[].{name:"display-name",ip:"ip-address",id:id,lifetime:lifetime,state:"lifecycle-state",assigned:"assigned-entity-id"}' --output table

printf '\n=== 7. OBJECT STORAGE BUCKETS, PARS & IAM DYNAMIC GROUPS / POLICIES ===\n'
NS="$(oci os ns get --region "$REGION" --query 'data' --raw-output)"
oci os bucket list --region "$REGION" --compartment-id "$TENANCY_ID" --namespace-name "$NS" --all --query 'data[].{name:name,created:"time-created"}' --output table
if oci os bucket get --region "$REGION" --namespace-name "$NS" --bucket-name "jobiest-gate2-vault" >/dev/null 2>&1; then
  oci os bucket get --region "$REGION" --namespace-name "$NS" --bucket-name "jobiest-gate2-vault" --query 'data.{name:name,public:"public-access-type",tier:"storage-tier",approx_bytes:"approximate-size",approx_count:"approximate-count"}'
  oci os preauth-request list --region "$REGION" --namespace-name "$NS" --bucket-name "jobiest-gate2-vault" --all --query 'data[].{id:id,name:name,access:"access-type",expires:"time-expires"}' --output table
fi
oci iam dynamic-group list --compartment-id "$TENANCY_ID" --all --query 'data[].{name:name,id:id,rule:"matching-rule",state:"lifecycle-state"}' --output table
oci iam policy list --compartment-id "$TENANCY_ID" --all --query 'data[].{name:name,id:id,statements:statements}'
