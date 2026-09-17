# Tests

`flutter test` runs everything here.

* `models_test.dart` — parsing of the real API payloads (jobs, applications,
  profile completeness, entitlements, resume draft, match results) plus the
  backend error-code → user-message mapping.
* `widget_test.dart` — the shared loading/error/empty/banner widgets.

These tests never touch the network: they assert the client's behaviour against
recorded response *shapes* copied from the backend routes, not live data.
