FROM maven:3.9.9-eclipse-temurin-21 AS build
WORKDIR /workspace
COPY pom.xml .
COPY src ./src
RUN mvn -B -ntp -DskipTests package

# JDK provides jcmd/JFR for reproducible load-test profiling.
FROM eclipse-temurin:21-jdk-alpine
ARG VCS_REF=unknown
LABEL org.opencontainers.image.revision=$VCS_REF
RUN addgroup -S app && adduser -S app -G app
WORKDIR /app
COPY --from=build /workspace/target/ticketrush-0.0.1-SNAPSHOT.jar app.jar
COPY docker-entrypoint.sh /usr/local/bin/ticketrush
RUN chmod 0555 /usr/local/bin/ticketrush
USER app
EXPOSE 8080
ENTRYPOINT ["/usr/local/bin/ticketrush"]
