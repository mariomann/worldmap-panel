'use strict';

System.register(['lodash', './libs/leaflet'], function (_export, _context) {
  "use strict";

  var _, L, _createClass, tileServers, WorldMap;

  function _classCallCheck(instance, Constructor) {
    if (!(instance instanceof Constructor)) {
      throw new TypeError("Cannot call a class as a function");
    }
  }

  return {
    setters: [function (_lodash) {
      _ = _lodash.default;
    }, function (_libsLeaflet) {
      L = _libsLeaflet.default;
    }],
    execute: function () {
      _createClass = function () {
        function defineProperties(target, props) {
          for (var i = 0; i < props.length; i++) {
            var descriptor = props[i];
            descriptor.enumerable = descriptor.enumerable || false;
            descriptor.configurable = true;
            if ("value" in descriptor) descriptor.writable = true;
            Object.defineProperty(target, descriptor.key, descriptor);
          }
        }

        return function (Constructor, protoProps, staticProps) {
          if (protoProps) defineProperties(Constructor.prototype, protoProps);
          if (staticProps) defineProperties(Constructor, staticProps);
          return Constructor;
        };
      }();

      tileServers = {
        'CartoDB Positron': { url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>', subdomains: 'abcd' },
        'CartoDB Dark': { url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>', subdomains: 'abcd' }
      };

      WorldMap = function () {
        function WorldMap(ctrl, mapContainer) {
          _classCallCheck(this, WorldMap);

          this.ctrl = ctrl;
          this.mapContainer = mapContainer;
          this.circles = [];

          return this.createMap();
        }

        _createClass(WorldMap, [{
          key: 'createMap',
          value: function createMap() {
            var mapCenter = window.L.latLng(parseFloat(this.ctrl.panel.mapCenterLatitude), parseFloat(this.ctrl.panel.mapCenterLongitude));
            this.map = window.L.map(this.mapContainer, { worldCopyJump: true, center: mapCenter, zoom: parseInt(this.ctrl.panel.initialZoom, 10) || 1 });
            this.setMouseWheelZoom();

            var selectedTileServer = tileServers[this.ctrl.tileServer];
            window.L.tileLayer(selectedTileServer.url, {
              maxZoom: 18,
              subdomains: selectedTileServer.subdomains,
              reuseTiles: true,
              detectRetina: true,
              attribution: selectedTileServer.attribution
            }).addTo(this.map);
          }
        }, {
          key: 'createLegend',
          value: function createLegend() {
            var _this = this;

            this.legend = window.L.control({ position: 'bottomleft' });
            this.legend.onAdd = function () {
              _this.legend._div = window.L.DomUtil.create('div', 'info legend');
              _this.legend.update();
              return _this.legend._div;
            };

            this.legend.update = function () {
              var thresholds = _this.ctrl.data.thresholds;
              var legendHtml = '';
              legendHtml += '<div class="legend-item"><i style="background:' + _this.ctrl.panel.colors[0] + '"></i> ' + '&lt; ' + thresholds[0] + '</div>';
              for (var index = 0; index < thresholds.length; index += 1) {
                legendHtml += '<div class="legend-item"><i style="background:' + _this.ctrl.panel.colors[index + 1] + '"></i> ' + thresholds[index] + (thresholds[index + 1] ? '&ndash;' + thresholds[index + 1] + '</div>' : '+');
              }
              _this.legend._div.innerHTML = legendHtml;
            };
            this.legend.addTo(this.map);
          }
        }, {
          key: 'needToRedrawCircles',
          value: function needToRedrawCircles(data) {
            if (this.circles.length === 0 && data.length > 0) return true;

            if (this.circles.length !== data.length) return true;
            var locations = _.map(_.map(this.circles, 'options'), 'location').sort();
            var dataPoints = _.map(data, 'key').sort();
            return !_.isEqual(locations, dataPoints);
          }
        }, {
          key: 'filterEmptyAndZeroValues',
          value: function filterEmptyAndZeroValues(data) {
            var _this2 = this;

            return _.filter(data, function (o) {
              return !(_this2.ctrl.panel.hideEmpty && _.isNil(o.value)) && !(_this2.ctrl.panel.hideZero && o.value === 0);
            });
          }
        }, {
          key: 'clearCircles',
          value: function clearCircles() {
            if (this.circlesLayer) {
              this.circlesLayer.clearLayers();
              this.removeCircles(this.circlesLayer);
              this.circles = [];
            }
          }
        }, {
          key: 'drawCircles',
          value: function drawCircles() {
            var data = this.filterEmptyAndZeroValues(this.ctrl.data);
            if (this.needToRedrawCircles(data)) {
              this.clearCircles();
              this.createCircles(data);
            } else {
              this.updateCircles(data);
            }
          }
        }, {
          key: 'createCircles',
          value: function createCircles(data) {
            var _this3 = this;

            var circles = [];
            data.forEach(function (dataPoint) {
              if (!dataPoint.locationName) return;
              circles.push(_this3.createCircle(dataPoint));
            });
            this.circlesLayer = this.addCircles(circles);
            this.circles = circles;
          }
        }, {
          key: 'updateCircles',
          value: function updateCircles(data) {
            var _this4 = this;

            data.forEach(function (dataPoint) {
              if (!dataPoint.locationName) return;

              var circle = _.find(_this4.circles, function (cir) {
                return cir.options.location === dataPoint.key;
              });

              if (circle && dataPoint.isAp) {
                _this4.updateApCircle(circle, dataPoint);
              } else if (circle) {
                circle.setRadius(_this4.calcCircleSize(dataPoint.value || 0));
                circle.setStyle({
                  color: _this4.getColor(dataPoint.value),
                  fillColor: _this4.getColor(dataPoint.value),
                  fillOpacity: 0.5,
                  location: dataPoint.key
                });
                circle.unbindPopup();
                _this4.createPopup(circle, dataPoint.locationName, dataPoint.valueRounded);

                //TODO to function
                circle.unbindTooltip();
                var text = dataPoint.totalProbes - dataPoint.failingProbes + "/" + dataPoint.totalProbes;
                circle.bindTooltip(text, {
                  permanent: true,
                  direction: 'center'
                });
              }
            });
          }
        }, {
          key: 'createCircle',
          value: function createCircle(dataPoint) {
            if (dataPoint.isAp) {
              return this.createApCircle(dataPoint);
            }

            var circle = window.L.circleMarker([dataPoint.locationLatitude, dataPoint.locationLongitude], {
              radius: this.calcCircleSize(dataPoint.value || 0),
              color: this.getColor(dataPoint.value),
              fillColor: this.getColor(dataPoint.value),
              fillOpacity: 0.5,
              location: dataPoint.key
            });

            this.createPopup(circle, dataPoint.locationName, dataPoint.valueRounded);
            return circle;
          }
        }, {
          key: 'updateApCircle',
          value: function updateApCircle(circle, dataPoint) {
            circle.setRadius(this.calcCircleSize(dataPoint.value || 0));
            circle.setStyle({
              color: this.getColor(dataPoint.successRate),
              fillColor: this.getColor(dataPoint.successRate),
              fillOpacity: 0.5,
              location: dataPoint.key
            });
            circle.unbindPopup();
            this.createApPopup(circle, dataPoint);

            circle.unbindTooltip();
            this.createApTooltip(circle, dataPoint);
          }
        }, {
          key: 'createApCircle',
          value: function createApCircle(dataPoint) {
            var circle = window.L.circleMarker([dataPoint.locationLatitude, dataPoint.locationLongitude], {
              radius: this.calcCircleSize(dataPoint.value || 0),
              color: this.getColor(dataPoint.successRate),
              fillColor: this.getColor(dataPoint.successRate),
              fillOpacity: 0.5,
              location: dataPoint.key
            });

            this.createApTooltip(circle, dataPoint);
            this.createApPopup(circle, dataPoint);

            // create link for clicking on circle
            // try to get target dashboard name from the variable called locationDashboard
            var locationDashboardName = null;
            if (this.ctrl.templateSrv.variableExists("$locationDashboard")) {
              locationDashboardName = this.ctrl.templateSrv.replace("$locationDashboard");
            } else {
              locationDashboardName = "probe-overview-per-location";
            }
            var locationLink = 'dashboard/db/' + locationDashboardName + '?var-location=' + dataPoint.key;
            circle.on('click', function (e) {
              window.open(locationLink, "_self");
            });

            return circle;
          }
        }, {
          key: 'createApTooltip',
          value: function createApTooltip(circle, dataPoint) {
            //const text = dataPoint.failingProbes + "/" + dataPoint.totalProbes;
            var text = void 0;
            if (dataPoint.failingProbes <= 0) {
              text = '<div class="ap-larger"><b>' + dataPoint.totalProbes + '</b></div>';
            } else {
              text = '\n        <div class="ap-larger" style="margin-top: 20px;"><b>' + dataPoint.totalProbes + '</b></div>\n        <div class="ap-meter">\n            <span class="ap-meter-span" style="width: ' + dataPoint.successRate + '%"><b>' + (dataPoint.totalProbes - dataPoint.failingProbes) + '</b></span>\n        </div>\n      ';

              // add  <div class="ap-meter-label"><b>${dataPoint.totalProbes - dataPoint.failingProbes}</b></div> to have number right to the progress bar
            }

            circle.bindTooltip(text, {
              permanent: true,
              direction: 'center'
            });
          }
        }, {
          key: 'createApPopup',
          value: function createApPopup(circle, dataPoint) {
            var locationName = dataPoint.locationName;
            var value = dataPoint.valueRounded;
            var unit = value && value === 1 ? this.ctrl.panel.unitSingular : this.ctrl.panel.unitPlural;
            //const label = (locationName + ': ' + value + ' ' + (unit || '')).trim();
            var label = '\n      <h4>[AP] ' + locationName + '</h4>\n      <ul>\n        <li>Success rate: ' + dataPoint.successRate + '% (' + dataPoint.failingProbes + ' failing out of ' + dataPoint.totalProbes + ')</li>\n        <li>Tested environments:\n    ';

            for (var environment in dataPoint.targetEnvironments) {
              label += '<br/>\t\t- ' + environment + ': ' + dataPoint.targetEnvironments[environment];
            }

            if (dataPoint.failingProbesNames.length > 0) {
              label += ('\n        </li>\n        <li>Failing probes name(s): ' + (dataPoint.failingProbesNames ? "<br/>\t\t- " + dataPoint.failingProbesNames.join("<br/>\t\t- ") : "-") + '</li>\n      </ul>\n    ').trim();
            }

            circle.bindPopup(label, { 'offset': window.L.point(0, -2), 'className': 'worldmap-popup', 'closeButton': this.ctrl.panel.stickyLabels });

            circle.on('mouseover', function onMouseOver(evt) {
              var layer = evt.target;
              layer.bringToFront();
              this.openPopup();
            });

            if (!this.ctrl.panel.stickyLabels) {
              circle.on('mouseout', function onMouseOut() {
                circle.closePopup();
              });
            }
          }
        }, {
          key: 'calcCircleSize',
          value: function calcCircleSize(dataPointValue) {
            var circleMinSize = parseInt(this.ctrl.panel.circleMinSize, 10) || 2;
            var circleMaxSize = parseInt(this.ctrl.panel.circleMaxSize, 10) || 30;

            if (this.ctrl.data.valueRange === 0) {
              return circleMaxSize;
            }

            var dataFactor = (dataPointValue - this.ctrl.data.lowestValue) / this.ctrl.data.valueRange;
            var circleSizeRange = circleMaxSize - circleMinSize;

            return circleSizeRange * dataFactor + circleMinSize;
          }
        }, {
          key: 'createPopup',
          value: function createPopup(circle, locationName, value) {
            var unit = value && value === 1 ? this.ctrl.panel.unitSingular : this.ctrl.panel.unitPlural;
            var label = (locationName + ': ' + value + ' ' + (unit || '')).trim();
            circle.bindPopup(label, { 'offset': window.L.point(0, -2), 'className': 'worldmap-popup', 'closeButton': this.ctrl.panel.stickyLabels });

            circle.on('mouseover', function onMouseOver(evt) {
              var layer = evt.target;
              layer.bringToFront();
              this.openPopup();
            });

            if (!this.ctrl.panel.stickyLabels) {
              circle.on('mouseout', function onMouseOut() {
                circle.closePopup();
              });
            }
          }
        }, {
          key: 'getColor',
          value: function getColor(value) {
            for (var index = this.ctrl.data.thresholds.length; index > 0; index -= 1) {
              if (value >= this.ctrl.data.thresholds[index - 1]) {
                return this.ctrl.panel.colors[index];
              }
            }
            return _.first(this.ctrl.panel.colors);
          }
        }, {
          key: 'resize',
          value: function resize() {
            this.map.invalidateSize();
          }
        }, {
          key: 'panToMapCenter',
          value: function panToMapCenter() {
            this.map.panTo([parseFloat(this.ctrl.panel.mapCenterLatitude), parseFloat(this.ctrl.panel.mapCenterLongitude)]);
            this.ctrl.mapCenterMoved = false;
          }
        }, {
          key: 'removeLegend',
          value: function removeLegend() {
            this.legend.remove(this.map);
            this.legend = null;
          }
        }, {
          key: 'setMouseWheelZoom',
          value: function setMouseWheelZoom() {
            if (!this.ctrl.panel.mouseWheelZoom) {
              this.map.scrollWheelZoom.disable();
            } else {
              this.map.scrollWheelZoom.enable();
            }
          }
        }, {
          key: 'addCircles',
          value: function addCircles(circles) {
            return window.L.layerGroup(circles).addTo(this.map);
          }
        }, {
          key: 'removeCircles',
          value: function removeCircles() {
            this.map.removeLayer(this.circlesLayer);
          }
        }, {
          key: 'setZoom',
          value: function setZoom(zoomFactor) {
            this.map.setZoom(parseInt(zoomFactor, 10));
          }
        }, {
          key: 'remove',
          value: function remove() {
            this.circles = [];
            if (this.circlesLayer) this.removeCircles();
            if (this.legend) this.removeLegend();
            this.map.remove();
          }
        }]);

        return WorldMap;
      }();

      _export('default', WorldMap);
    }
  };
});
//# sourceMappingURL=worldmap.js.map
