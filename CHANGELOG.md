# bedrock-ledger-consensus-continuity-storage ChangeLog

## 6.0.0 - 2021-07-xx

### Removed
- **BREAKING**: Remove unused `localAncestorGeneration` from events.

## 5.0.0 - 2021-07-16

### Changed
- **BREAKING**: `events.getHead` takes `peerId` instead of `creatorId`.
- **BREAKING**: `events.getAvgConsensusTime` takes `peerId` instead of
  `creatorId`.

### Added
  - Add getMostRecentLocalEventNumber() and supporting index.

### Removed
- **BREAKING**: `events.getStartHash` has been removed.
- **BREAKING**: `events.aggregateHistory` has been removed.
- Remove getConsensusProofPeers test in preparation for feature removal.

## 4.0.0 - 2021-04-29

### Changed
- **BREAKING**: Upgraded MongodDB indexes.

### Added
- Add `events.hasOutstandingParentHashCommitments` API.
- Add `events.hasOutstandingRegularEvents` API.

## 3.0.0 - 2020-12-01

### Changed
- **BREAKING**: Use `bedrock-mongodb` 8.1.x.
- **BREAKING**: Use `bedrock-ledger-node` ^11.0.0.
- Use `collection.collectionName` over `collection.s.name`.

## 2.5.0 - 2020-10-06

### Changed
- Return covered field consensus in events getHead API.

## 2.4.2 - 2019-12-17

### Changed
- Update peer dependencies.

## 2.4.1 - 2019-11-13

### Changed
- Update peer dependency for bedrock v1 - v3.

## 2.4.0 - 2019-03-25

### Changes
- Use bedrock-ledger-node@8.

## 2.3.0 - 2019-02-15

### Changed
- Add additional fields to `aggregateHistory` index to address slow queries.

## 2.2.0 - 2018-12-31

### Added
- Implement `setEffectiveConfiguration` API.

## 2.1.0 - 2018-12-12

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
