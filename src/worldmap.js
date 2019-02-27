import _ from 'lodash';
/* eslint-disable id-length, no-unused-vars */
import L from './libs/leaflet';
/* eslint-disable id-length, no-unused-vars */

const tileServers = {
  'CartoDB Positron': { url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png', attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>', subdomains: 'abcd' },
  'CartoDB Dark': { url: 'https://cartodb-basemaps-{s}.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png', attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="http://cartodb.com/attributions">CartoDB</a>', subdomains: 'abcd' }
};

/**
window.L.CircleMarker.include({
  bindLabel: function (content, options) {
      if (!this._label || this._label.options !== options) {
          this._label = new window.L.Label(options, this);
      }

      this._label.setContent(content);
      this._labelNoHide = options && options.noHide;

      if (!this._showLabelAdded) {
          if (this._labelNoHide) {
              this
                  .on('remove', this.hideLabel, this)
                  .on('move', this._moveLabel, this);
              this._showLabel({latlng: this.getLatLng()});
          } else {
              this
                  .on('mouseover', this._showLabel, this)
                  .on('mousemove', this._moveLabel, this)
                  .on('mouseout remove', this._hideLabel, this);
              if (window.L.Browser.touch) {
                  this.on('click', this._showLabel, this);
              }
          }
          this._showLabelAdded = true;
      }

      return this;
  },

  unbindLabel: function () {
      if (this._label) {
          this._hideLabel();
          this._label = null;
          this._showLabelAdded = false;
          if (this._labelNoHide) {
              this
                  .off('remove', this._hideLabel, this)
                  .off('move', this._moveLabel, this);
          } else {
              this
                  .off('mouseover', this._showLabel, this)
                  .off('mousemove', this._moveLabel, this)
                  .off('mouseout remove', this._hideLabel, this);
          }
      }
      return this;
  }
});
*/
export default class WorldMap {
  constructor(ctrl, mapContainer) {
    this.ctrl = ctrl;
    this.mapContainer = mapContainer;
    this.circles = [];

    return this.createMap();
  }

  createMap() {
    const mapCenter = window.L.latLng(parseFloat(this.ctrl.panel.mapCenterLatitude), parseFloat(this.ctrl.panel.mapCenterLongitude));
    this.map = window.L.map(this.mapContainer, { worldCopyJump: true, center: mapCenter, zoom: parseInt(this.ctrl.panel.initialZoom, 10) || 1 });
    this.setMouseWheelZoom();

    const selectedTileServer = tileServers[this.ctrl.tileServer];
    window.L.tileLayer(selectedTileServer.url, {
      maxZoom: 18,
      subdomains: selectedTileServer.subdomains,
      reuseTiles: true,
      detectRetina: true,
      attribution: selectedTileServer.attribution
    }).addTo(this.map);
  }

  createLegend() {
    this.legend = window.L.control({ position: 'bottomleft' });
    this.legend.onAdd = () => {
      this.legend._div = window.L.DomUtil.create('div', 'info legend');
      this.legend.update();
      return this.legend._div;
    };

    this.legend.update = () => {
      const thresholds = this.ctrl.data.thresholds;
      let legendHtml = '';
      legendHtml += '<div class="legend-item"><i style="background:' + this.ctrl.panel.colors[0] + '"></i> ' +
        '&lt; ' + thresholds[0] + '</div>';
      for (let index = 0; index < thresholds.length; index += 1) {
        legendHtml +=
          '<div class="legend-item"><i style="background:' + this.ctrl.panel.colors[index + 1] + '"></i> ' +
          thresholds[index] + (thresholds[index + 1] ? '&ndash;' + thresholds[index + 1] + '</div>' : '+');
      }
      this.legend._div.innerHTML = legendHtml;
    };
    this.legend.addTo(this.map);
  }

  needToRedrawCircles(data) {
    if (this.circles.length === 0 && data.length > 0) return true;

    if (this.circles.length !== data.length) return true;
    const locations = _.map(_.map(this.circles, 'options'), 'location').sort();
    const dataPoints = _.map(data, 'key').sort();
    return !_.isEqual(locations, dataPoints);
  }

  filterEmptyAndZeroValues(data) {
    return _.filter(data, (o) => { return !(this.ctrl.panel.hideEmpty && _.isNil(o.value)) && !(this.ctrl.panel.hideZero && o.value === 0); });
  }

  clearCircles() {
    if (this.circlesLayer) {
      this.circlesLayer.clearLayers();
      this.removeCircles(this.circlesLayer);
      this.circles = [];
    }
  }

  drawCircles() {
    const data = this.filterEmptyAndZeroValues(this.ctrl.data);
    if (this.needToRedrawCircles(data)) {
      this.clearCircles();
      this.createCircles(data);
    } else {
      this.updateCircles(data);
    }
  }

  createCircles(data) {
    const circles = [];
    data.forEach((dataPoint) => {
      if (!dataPoint.locationName) return;
      circles.push(this.createCircle(dataPoint));
    });
    this.circlesLayer = this.addCircles(circles);
    this.circles = circles;
  }

  updateCircles(data) {
    data.forEach((dataPoint) => {
      if (!dataPoint.locationName) return;

      const circle = _.find(this.circles, (cir) => { return cir.options.location === dataPoint.key; });

      if (circle && dataPoint.isAp) {
        this.updateApCircle(circle, dataPoint);
      } else if (circle) {
        circle.setRadius(this.calcCircleSize(dataPoint.value || 0));
        circle.setStyle({
          color: this.getColor(dataPoint.value),
          fillColor: this.getColor(dataPoint.value),
          fillOpacity: 0.5,
          location: dataPoint.key,
        });
        circle.unbindPopup();
        this.createPopup(circle, dataPoint.locationName, dataPoint.valueRounded);

        //TODO to function
        circle.unbindTooltip();
        const text = (dataPoint.totalProbes - dataPoint.failingProbes) + "/" + dataPoint.totalProbes;
        circle.bindTooltip(text, {
          permanent: true,
          direction: 'center'
        });
      }
    });
  }

  createCircle(dataPoint) {
    if (dataPoint.isAp) {
      return this.createApCircle(dataPoint);
    }

    const circle = window.L.circleMarker([dataPoint.locationLatitude, dataPoint.locationLongitude], {
      radius: this.calcCircleSize(dataPoint.value || 0),
      color: this.getColor(dataPoint.value),
      fillColor: this.getColor(dataPoint.value),
      fillOpacity: 0.5,
      location: dataPoint.key
    });

    this.createPopup(circle, dataPoint.locationName, dataPoint.valueRounded);
    return circle;
  }

  updateApCircle(circle, dataPoint) {
    circle.setRadius(this.calcCircleSize(dataPoint.value || 0));
    circle.setStyle({
      color: this.getColor(dataPoint.successRate),
      fillColor: this.getColor(dataPoint.successRate),
      fillOpacity: 0.5,
      location: dataPoint.key,
    });
    circle.unbindPopup();
    this.createApPopup(circle, dataPoint);

    circle.unbindTooltip();
    this.createApTooltip(circle, dataPoint);
  }

  createApCircle(dataPoint) {
    const circle = window.L.circleMarker([dataPoint.locationLatitude, dataPoint.locationLongitude], {
      radius: this.calcCircleSize(dataPoint.value || 0),
      color: this.getColor(dataPoint.successRate),
      fillColor: this.getColor(dataPoint.successRate),
      fillOpacity: 0.5,
      location: dataPoint.key
    });

    this.createApTooltip(circle, dataPoint);
    this.createApPopup(circle, dataPoint);

    // create link for clicking on circle
    // try to get target dashboard name and urlParams from Dashboard Variables
    var locationDashboard = this.ctrl.templateSrv.variableExists("$locationDashboard") ? this.ctrl.templateSrv.replace("$locationDashboard") : "probe-overview-per-location";
    var urlParamString = "";

    if (this.ctrl.templateSrv.variableExists("$urlParams")) {
      var urlParams = this.ctrl.templateSrv.variables.find(e => e.name == "urlParams").current.value.split(",");
      var _this = this
      urlParams.forEach(urlParam => {
        if (_this.ctrl.templateSrv.variableExists("$" + urlParam)) {
          var selectedValues = _this.ctrl.templateSrv.replace("$" + urlParam).replace("{", "").replace("}", "").split(",");
          selectedValues.forEach(selectedValue => {
            urlParamString = urlParamString.concat("var-" + urlParam + "=" + selectedValue + "&");
          });
        } else {
            console.log("No dashboard variable exists for " + urlParam)
        }
      });
    }

    var locationLink = 'dashboard/db/' + locationDashboard + '?' + urlParamString + 'var-location=' + dataPoint.key;
    circle.on('click', function (e) {
      window.open(locationLink, "_self");
    });

    return circle;
  }

  createApTooltip(circle, dataPoint) {
    //const text = dataPoint.failingProbes + "/" + dataPoint.totalProbes;
    let text;
    if (dataPoint.failingProbes <= 0) {
      text = `<div class="ap-larger"><b>${dataPoint.totalProbes}</b></div>`;
    } else {
      text = `
        <div class="ap-larger" style="margin-top: 20px;"><b>${dataPoint.totalProbes}</b></div>
        <div class="ap-meter">
            <span class="ap-meter-span" style="width: ${dataPoint.successRate}%"><b>${dataPoint.totalProbes - dataPoint.failingProbes}</b></span>
        </div>
      `;

      // add  <div class="ap-meter-label"><b>${dataPoint.totalProbes - dataPoint.failingProbes}</b></div> to have number right to the progress bar
    }

    circle.bindTooltip(text, {
      permanent: true,
      direction: 'center'
    });
  }

  createApPopup(circle, dataPoint) {
    const locationName = dataPoint.locationName;
    const value = dataPoint.valueRounded;
    const unit = value && value === 1 ? this.ctrl.panel.unitSingular : this.ctrl.panel.unitPlural;
    //const label = (locationName + ': ' + value + ' ' + (unit || '')).trim();
    let label = `
      <h4>[AP] ${locationName}</h4>
      <ul>
        <li>Success rate: ${dataPoint.successRate}% (${dataPoint.failingProbes} failing out of ${dataPoint.totalProbes})</li>
        <li>Tested environments:
    `;

    for (var environment in dataPoint.targetEnvironments) {
      label += `<br/>\t\t- ${environment}: ${dataPoint.targetEnvironments[environment]}`;
    }

    if(dataPoint.failingProbesNames.length > 0) {
      label += `
        </li>
        <li>Failing probes name(s): ${dataPoint.failingProbesNames ? "<br/>\t\t- " + dataPoint.failingProbesNames.join("<br/>\t\t- ") : "-"}</li>
      </ul>
    `.trim();
    }

    circle.bindPopup(label, { 'offset': window.L.point(0, -2), 'className': 'worldmap-popup', 'closeButton': this.ctrl.panel.stickyLabels });

    circle.on('mouseover', function onMouseOver(evt) {
      const layer = evt.target;
      layer.bringToFront();
      this.openPopup();
    });

    if (!this.ctrl.panel.stickyLabels) {
      circle.on('mouseout', function onMouseOut() {
        circle.closePopup();
      });
    }
  }

  calcCircleSize(dataPointValue) {
    const circleMinSize = parseInt(this.ctrl.panel.circleMinSize, 10) || 2;
    const circleMaxSize = parseInt(this.ctrl.panel.circleMaxSize, 10) || 30;

    if (this.ctrl.data.valueRange === 0) {
      return circleMaxSize;
    }

    const dataFactor = (dataPointValue - this.ctrl.data.lowestValue) / this.ctrl.data.valueRange;
    const circleSizeRange = circleMaxSize - circleMinSize;

    return (circleSizeRange * dataFactor) + circleMinSize;
  }

  createPopup(circle, locationName, value) {
    const unit = value && value === 1 ? this.ctrl.panel.unitSingular : this.ctrl.panel.unitPlural;
    const label = (locationName + ': ' + value + ' ' + (unit || '')).trim();
    circle.bindPopup(label, { 'offset': window.L.point(0, -2), 'className': 'worldmap-popup', 'closeButton': this.ctrl.panel.stickyLabels });

    circle.on('mouseover', function onMouseOver(evt) {
      const layer = evt.target;
      layer.bringToFront();
      this.openPopup();
    });

    if (!this.ctrl.panel.stickyLabels) {
      circle.on('mouseout', function onMouseOut() {
        circle.closePopup();
      });
    }
  }

  getColor(value) {
    for (let index = this.ctrl.data.thresholds.length; index > 0; index -= 1) {
      if (value >= this.ctrl.data.thresholds[index - 1]) {
        return this.ctrl.panel.colors[index];
      }
    }
    return _.first(this.ctrl.panel.colors);
  }

  resize() {
    this.map.invalidateSize();
  }

  panToMapCenter() {
    this.map.panTo([parseFloat(this.ctrl.panel.mapCenterLatitude), parseFloat(this.ctrl.panel.mapCenterLongitude)]);
    this.ctrl.mapCenterMoved = false;
  }

  removeLegend() {
    this.legend.remove(this.map);
    this.legend = null;
  }

  setMouseWheelZoom() {
    if (!this.ctrl.panel.mouseWheelZoom) {
      this.map.scrollWheelZoom.disable();
    } else {
      this.map.scrollWheelZoom.enable();
    }
  }

  addCircles(circles) {
    return window.L.layerGroup(circles).addTo(this.map);
  }

  removeCircles() {
    this.map.removeLayer(this.circlesLayer);
  }

  setZoom(zoomFactor) {
    this.map.setZoom(parseInt(zoomFactor, 10));
  }

  remove() {
    this.circles = [];
    if (this.circlesLayer) this.removeCircles();
    if (this.legend) this.removeLegend();
    this.map.remove();
  }
}
