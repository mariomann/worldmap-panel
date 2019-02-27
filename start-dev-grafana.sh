#!/usr/bin/env bash
docker run -p 3000:3000 -d --name grafana-plugin-dev --volume $(pwd)/dist:/var/lib/grafana/plugins/worldmap-panel grafana/grafana:5.4.3
