# bedrock-ledger-consensus-continuity-storage ChangeLog

## 2.1.0 - TBD

### Fixed
- Ensure that the starting points for the `aggregateHistory` query are merge
  events.

### Changed
- Compute starting point for `aggregateHistory` query.
- Remove unused `startHash` parameter.

## 2.0.0 - 2018-10-09

### Changed
- **BREAKING** The `aggregateHistory` API now requires a `startParentHash`
  parameter.

## 1.0.2 - 2018-09-20

### Changed
- Use bedrock-validation 3.x in the test suite.

## 1.0.1 - 2018-09-20

### Changed
- Update dependencies to released versions.

## 1.0.0 - 2018-09-11

- See git history for changes.
