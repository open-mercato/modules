# The backup and restore jobs of compose.yaml (spec, Backup and restore): pg_dump and pg_restore of PostgreSQL 17, age
# for the encryption to the owner's public key, ssh and scp for the Storage Box of Q8. Run as the user `cmsbackup` with
# the uid of the user `node` of the Strapi image, so restored uploads belong to Strapi (and a new uploads volume, which
# Docker creates from this image's /uploads, too).
FROM postgres:17.12-bookworm
RUN apt-get update \
  && apt-get install --yes --no-install-recommends age openssh-client \
  && rm -rf /var/lib/apt/lists/* \
  && useradd --uid 1000 --create-home --shell /usr/sbin/nologin cmsbackup \
  && mkdir /uploads /exports && chown cmsbackup:cmsbackup /uploads /exports
USER cmsbackup
