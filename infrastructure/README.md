# Infrastructure

Week 1 dependencies are managed by the root Docker Compose file. PostgreSQL owns
persistent application data; Redis owns short-lived login counters; RabbitMQ is
provisioned for future milestones without business queues or consumers.
