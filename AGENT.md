# Project: TicketRush — High-load ticket booking / flash-sale platform

## Goal
Portfolio project proving: no overselling, idempotent payments, reservation TTL,
waiting room, and measurable performance under load. Correctness and measurements
matter more than feature count.

## Stack (do not change without asking)
Java 21, Spring Boot, Maven, Spring Security (JWT), Spring Data JPA, Flyway,
PostgreSQL, Redis, RabbitMQ, Testcontainers, JUnit 5, k6, Docker Compose,
GitHub Actions, Prometheus + Grafana. Frontend (later): Next.js + TypeScript.

## Architecture
Modular monolith, base package com.vibe.ticketrush with modules:
auth, event, inventory, reservation, order, payment, queue, notification, outbox, admin, common.
Each module: controller / service / repository / domain / dto.
Modules communicate via service interfaces or domain events, never via another
module's repository.

## Critical invariants (must be covered by tests)
1. Sold + held quantity never exceeds total capacity, under concurrent requests.
2. The same Idempotency-Key never creates two orders or two charges.
3. An expired reservation always returns its tickets to inventory exactly once.
4. Outbox events are written in the same transaction as the business change.
5. Message consumers are idempotent.

## Working rules
1. Do ONE task at a time as instructed; do not implement later milestones.
2. First state your plan and the files you will create or change.
3. Write tests with the feature. Concurrency behavior must be tested with
   real concurrent threads using Testcontainers (real PostgreSQL/Redis), not mocks.
4. Run build and tests before finishing and report real results.
5. No hardcoded secrets; use env vars and provide .env.example.
6. Validate input, enforce authorization on every endpoint, no SQL concatenation.
7. Conventional Commits in English, small commits.
8. Record each significant design decision in docs/decisions/NNNN-title.md
   (context, options, decision, consequences).
9. If something is ambiguous, choose the simplest option, document it, continue.
10. End each task with: what was done, what was not, how to run, next steps.