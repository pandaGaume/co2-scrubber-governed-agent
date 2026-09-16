# The factory image of the demo: the published job runner, the demo's graphs
# and specs. Built from the repository root after `npm install`:
#
#   docker build -f docker/Dockerfile -t ghcr.io/pandagaume/co2-scrubber-factory:0.1.0 .
#   docker run --rm -v "$PWD/outputs:/outputs" ghcr.io/pandagaume/co2-scrubber-factory:0.1.0
#
# The runner comes from @spiky-panda/factory (Business Source License 1.1);
# this image only adds the demo's own files (Apache 2.0).
FROM node:22-slim

WORKDIR /app
COPY node_modules/@spiky-panda/factory/bundle/spikypanda-job.js /app/spikypanda-job.js
COPY graphs/ /app/graphs/
COPY specs/ /specs/

# Where a job platform mounts its bucket; also the default output directory.
ENV NEBIUS_OUTPUT_DIR=/outputs
VOLUME ["/outputs"]

ENTRYPOINT ["node", "/app/spikypanda-job.js"]
CMD ["/specs/container/rs385-tilt.json"]
