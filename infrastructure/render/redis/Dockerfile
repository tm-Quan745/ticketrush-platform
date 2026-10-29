FROM redis:7.4-alpine

COPY docker-entrypoint.sh /usr/local/bin/ticketrush-redis

RUN chmod 0555 /usr/local/bin/ticketrush-redis

ENTRYPOINT ["/usr/local/bin/ticketrush-redis"]
