# Payment Architecture — Flutterwave

## Plans
- FREE: ₦0; 2 AI career credits/day; no autonomous applications.
- BASIC: ₦5,000/month; 10 automated applications/day.
- PREMIUM: ₦10,000/month; 20 automated applications/day.
- Automation trial: 7 days; 15 total automated applications.

## Flow
1. Authenticated user selects plan.
2. Server validates plan against `subscription_plans`.
3. Server creates Flutterwave checkout transaction.
4. User pays on Flutterwave.
5. Flutterwave webhook reaches server.
6. Server verifies webhook signature.
7. Server checks event idempotency.
8. Server calls Flutterwave transaction verification.
9. Server validates successful status, NGN currency, expected amount and transaction reference.
10. Server applies subscription entitlement atomically.

Never grant premium access from a client redirect alone.
