# Distributed Systems Notes

## CAP Theorem

The CAP theorem (Brewer's theorem) states that a distributed data store cannot
simultaneously provide more than two of the following three guarantees:

- **Consistency (C)**: Every read receives the most recent write or an error
- **Availability (A)**: Every request receives a (non-error) response, without the guarantee that it contains the most recent write
- **Partition Tolerance (P)**: The system continues to operate despite an arbitrary number of messages being dropped or delayed by the network

In practice, network partitions are unavoidable in distributed systems, so the
real design choice is between **CP** (consistency + partition tolerance) and
**AP** (availability + partition tolerance).

## Consensus Algorithms

Consensus algorithms are fundamental to distributed systems. They allow multiple
nodes to agree on a value or state, even in the presence of failures.

### Paxos
Paxos, proposed by Leslie Lamport, is a family of protocols for solving consensus
in a network of processes. It is known for its correctness proofs but criticized
for its complexity.

### Raft
Raft was designed as a more understandable alternative to Paxos. It decomposes
the consensus problem into leader election, log replication, and safety, making
it significantly easier to teach and implement.

### PBFT (Practical Byzantine Fault Tolerance)
PBFT provides consensus in the presence of Byzantine (malicious) failures. It
requires 3f+1 nodes to tolerate f faulty nodes, making it suitable for smaller
clusters where Byzantine faults are a concern.

## Consistency Models

- **Linearizability**: The strongest consistency model. Every operation appears to take effect atomically at some point between its invocation and response.
- **Sequential Consistency**: All operations appear to execute in some total order, consistent with each process's local order.
- **Eventual Consistency**: Given enough time without updates, all replicas will converge to the same value. Used in AP systems.

## Key-Value Stores and Distribution

Modern distributed key-value stores (Dynamo, Cassandra, Riak) use consistent
hashing for data partitioning and vector clocks for conflict detection. The
Dynamo paper (DeCandia et al., 2007) introduced the tunable consistency model
where read and write quorum sizes can be configured (R + W > N for strong consistency).