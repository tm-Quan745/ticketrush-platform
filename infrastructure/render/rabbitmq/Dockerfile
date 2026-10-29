FROM rabbitmq:4.1-management-alpine

COPY enabled_plugins /etc/rabbitmq/enabled_plugins

ENV RABBITMQ_NODENAME=rabbit@localhost

RUN chown rabbitmq:rabbitmq /etc/rabbitmq/enabled_plugins

USER rabbitmq:rabbitmq
