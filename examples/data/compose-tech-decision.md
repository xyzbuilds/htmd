# Tech decision: which database for v2?

The platform team needs to choose a database for the v2 backend by end of sprint. Below is the agent's analysis: a weighted decision matrix, a side-by-side comparison of the top three contenders, a few clarifying questions, and a list of follow-up tasks.

You can edit any score/weight in the matrix, pick a winner from the comparison, answer the open questions, and decide which migration tasks are approved. The **Copy all changes** button at the bottom-left aggregates everything into one prompt to send back to the agent.

## The matrix

```htmd:decision-matrix
question: Which database for the v2 backend?
context: Need to support 100k+ concurrent connections, complex aggregations, ops team of 3. Decision needed by Friday.
prompt_intro: My take on the database decision.
criteria:
  - { name: Query performance, weight: 5, note: at our 95p workload }
  - { name: Operational simplicity, weight: 4 }
  - { name: Cost ($/k req), weight: 3, direction: lower_better }
  - { name: Team familiarity, weight: 3 }
  - { name: Ecosystem & tooling, weight: 2 }
  - { name: Vendor lock-in risk, weight: 2, direction: lower_better }
options:
  - name: PostgreSQL (managed)
    scores: { Query performance: 8, Operational simplicity: 9, Cost ($/k req): 4, Team familiarity: 9, Ecosystem & tooling: 9, Vendor lock-in risk: 2 }
  - name: ClickHouse Cloud
    scores: { Query performance: 10, Operational simplicity: 7, Cost ($/k req): 6, Team familiarity: 4, Ecosystem & tooling: 7, Vendor lock-in risk: 5 }
  - name: DynamoDB
    scores: { Query performance: 7, Operational simplicity: 9, Cost ($/k req): 8, Team familiarity: 5, Ecosystem & tooling: 6, Vendor lock-in risk: 9 }
  - name: Self-hosted Cassandra
    scores: { Query performance: 8, Operational simplicity: 3, Cost ($/k req): 3, Team familiarity: 3, Ecosystem & tooling: 5, Vendor lock-in risk: 1 }
```

## Side-by-side of the top 3

```htmd:comparison-3-up
title: Top three options
subtitle: Same three options as in the matrix, but with the qualitative reasoning the matrix can't capture.
suggested: PostgreSQL (managed)
prompt_intro: My pick from the comparison.
approaches:
  - name: PostgreSQL (managed)
    summary: A boring, well-understood relational database. Managed by AWS RDS or Cloud SQL.
    pros:
      - Team has 10+ years of operational experience
      - Single source of truth for both OLTP and OLAP via partitioning
      - Lowest migration risk
    cons:
      - May need partitioning + read replicas at our peak
      - Aggregations on large tables are slower than columnar
    when_to_use: When team familiarity and operational risk dominate.
  - name: ClickHouse Cloud
    summary: Columnar, optimized for aggregations. Hosted by ClickHouse Inc.
    pros:
      - 10x faster for analytical queries at our shape
      - Compression makes storage near-free
      - Native S3 integration for cold tier
    cons:
      - Team has zero ops experience with it
      - Joins between tables remain expensive
      - Vendor lock-in (their cloud, their pricing)
    when_to_use: When analytical queries dominate the workload.
  - name: DynamoDB
    summary: Managed key-value store with global tables.
    pros:
      - Single-digit ms latency at any scale
      - Zero ops, fully managed
      - Pay-per-request pricing scales linearly
    cons:
      - No SQL — every query needs a pre-built index
      - Aggregations require export to a separate system
      - Hard lock-in to AWS
    when_to_use: When access patterns are simple and predictable.
verdict: |
  Postgres is boring and that's exactly why I'd pick it. ClickHouse is faster for the ~30% of our workload that's analytical, but adopting a new database for that fraction risks the rest. Re-evaluate in 12 months when the analytical workload may dominate.
```

## Questions I need answered before locking this in

```htmd:q-and-a
title: Open questions
prompt_intro: Answers to the open database-decision questions.
questions:
  - id: q1
    prompt: Will the analytical workload (currently ~30% of queries) likely grow to >50% in the next 12 months?
    kind: single
    choices: ["Yes — likely >50%", "No — staying around 30%", "Don't know"]
  - id: q2
    prompt: Is on-call burden a hard constraint? (i.e., would adding ops complexity kill this)
    kind: single
    choices: ["Hard constraint — must not add ops burden", "Soft — willing to add ops if perf wins", "No constraint"]
  - id: q3
    prompt: Are there compliance / data-residency requirements that exclude any of the cloud-hosted options?
    kind: free
    placeholder: "GDPR, HIPAA, anything else?"
```

## Migration plan — please approve / hold per task

If we go with Postgres, here are the work items I'd queue. Pick approve / reject / hold per item.

```htmd:approval-list
title: Migration tasks (assuming Postgres is the choice)
prompt_intro: Decisions on the migration tasks.
items:
  - id: m1
    title: Set up RDS Postgres in staging with a 50% prod data dump
    suggested: approve
    body: One-week effort, no production risk.
  - id: m2
    title: Build the dual-write layer (writes to both old DB and Postgres)
    suggested: approve
    body: 2-3 weeks. Critical path. Requires a feature flag.
  - id: m3
    title: Backfill historical data with throttled batch job
    suggested: approve
    body: Runs over 2-3 days off-peak.
  - id: m4
    title: Migrate the analytical queries to materialized views
    suggested: hold
    body: Could wait until after cutover; risks scope creep.
  - id: m5
    title: Cut over reads (10%, then 50%, then 100%)
    suggested: approve
    body: Requires the dual-write to be solid first.
  - id: m6
    title: Decommission the old DB and reclaim the budget line
    suggested: approve
    body: Final cleanup; saves ~$1.8k/mo.
```

---

When you're done, hit **Copy all changes** at the bottom-left to send the revised matrix, your decision, the answers, and the approved task list back as one prompt.
