import { MetricsPanelCtrl } from "grafana/app/plugins/sdk";
import TimeSeries from "grafana/app/core/time_series2";

import config from 'grafana/app/core/config';
import * as _ from "lodash";
import DataFormatter from "./data_formatter";
import "./css/worldmap-panel.css";
import $ from "jquery";
import "./css/leaflet.css";
import WorldMap from "./worldmap";

const panelDefaults = {
  maxDataPoints: 1,
  mapCenter: "(0°, 0°)",
  mapCenterLatitude: 0,
  mapCenterLongitude: 0,
  initialZoom: 1,
  valueName: "total",
  circleMinSize: 2,
  circleMaxSize: 30,
  locationData: "countries",
  thresholds: "0,10",
  colors: [
    "rgba(245, 54, 54, 0.9)",
    "rgba(237, 129, 40, 0.89)",
    "rgba(50, 172, 45, 0.97)"
  ],
  unitSingle: "",
  unitPlural: "",
  showLegend: true,
  mouseWheelZoom: false,
  esMetric: "Count",
  decimals: 0,
  hideEmpty: false,
  hideZero: false,
  stickyLabels: false,
  tableQueryOptions: {
    queryType: "geohash",
    geohashField: "geohash",
    latitudeField: "latitude",
    longitudeField: "longitude",
    metricField: "metric"
  }
};

const mapCenters = {
  "(0°, 0°)": { mapCenterLatitude: 0, mapCenterLongitude: 0 },
  "North America": { mapCenterLatitude: 40, mapCenterLongitude: -100 },
  Europe: { mapCenterLatitude: 46, mapCenterLongitude: 14 },
  "West Asia": { mapCenterLatitude: 26, mapCenterLongitude: 53 },
  "SE Asia": { mapCenterLatitude: 10, mapCenterLongitude: 106 },
  "Last GeoHash": { mapCenterLatitude: 0, mapCenterLongitude: 0 }
};

export default class WorldmapCtrl extends MetricsPanelCtrl {
  static templateUrl = "partials/module.html";

  dataFormatter: DataFormatter;
  locations: any;
  tileServer: string;
  saturationClass: string;
  map: any;
  series: any;
  data: any;
  mapCenterMoved: boolean;
  datasourceType: any;

  /** @ngInject **/
  constructor($scope, $injector, contextSrv) {
    super($scope, $injector);

    this.setMapProvider(contextSrv);
    _.defaults(this.panel, panelDefaults);

    this.dataFormatter = new DataFormatter(this);

    this.events.on("init-edit-mode", this.onInitEditMode.bind(this));
    this.events.on("data-received", this.onDataReceived.bind(this));
    this.events.on("panel-teardown", this.onPanelTeardown.bind(this));
    this.events.on("data-snapshot-load", this.onDataSnapshotLoad.bind(this));

    this.loadLocationDataFromFile();
  }

  setMapProvider(contextSrv) {
    this.tileServer = contextSrv.user.lightTheme
      ? "CartoDB Positron"
      : "CartoDB Dark";
    this.setMapSaturationClass();
  }

  setMapSaturationClass() {
    if (this.tileServer === "CartoDB Dark") {
      this.saturationClass = "map-darken";
    } else {
      this.saturationClass = "";
    }
  }

  loadLocationDataFromFile(reload?) {
    if (this.map && !reload) {
      return;
    }

    if (this.panel.snapshotLocationData) {
      this.locations = this.panel.snapshotLocationData;
      return;
    }

    if (this.panel.locationData === "jsonp endpoint") {
      if (!this.panel.jsonpUrl || !this.panel.jsonpCallback) {
        return;
      }

      $.ajax({
        type: "GET",
        url: this.panel.jsonpUrl + "?callback=?",
        contentType: "application/json",
        jsonpCallback: this.panel.jsonpCallback,
        dataType: "jsonp",
        success: res => {
          this.locations = res;
          this.render();
        }
      });
    } else if (this.panel.locationData === "json endpoint") {
      if (!this.panel.jsonUrl) {
        return;
      }

      $.getJSON(this.panel.jsonUrl).then(res => {
        this.locations = res;
        this.render();
      });
    } else if (this.panel.locationData === "table") {
      // .. Do nothing
    } else if (
      this.panel.locationData !== "geohash" &&
      this.panel.locationData !== "json result"
    ) {
      $.getJSON(
        "public/plugins/grafana-worldmap-panel/data/" +
          this.panel.locationData +
          ".json"
      ).then(this.reloadLocations.bind(this));
    }
  }

  reloadLocations(res) {
    this.locations = res;
    this.refresh();
  }

  showTableGeohashOptions() {
    return (
      this.panel.locationData === "table" &&
      this.panel.tableQueryOptions.queryType === "geohash"
    );
  }

  showTableCoordinateOptions() {
    return (
      this.panel.locationData === "table" &&
      this.panel.tableQueryOptions.queryType === "coordinates"
    );
  }

  onPanelTeardown() {
    if (this.map) {
      this.map.remove();
    }
  }

  onInitEditMode() {
    this.addEditorTab(
      "Worldmap",
      "public/plugins/grafana-worldmap-panel/partials/editor.html",
      2
    );
  }

  onDataReceived(dataList) {
    if (!dataList) return;

    if (this.dashboard.snapshot && this.locations) {
      this.panel.snapshotLocationData = this.locations;
    }

    const data = [];

    if (this.panel.locationData === 'geohash') {
      this.dataFormatter.setGeohashValues(dataList, data);
    } else if (this.panel.locationData === 'table') {
      const tableData = dataList.map(DataFormatter.tableHandler.bind(this));
      this.dataFormatter.setTableValues(tableData, data);
    } else if (this.panel.locationData === 'json result') {
      this.series = dataList;
      this.dataFormatter.setJsonValues(data);
    } else {
      console.log('Processing AP data..');
      const regions = this.processApData(dataList);
      if (regions.length > 0) {
        this.series = regions.map(this.apSeriesHandler.bind(this));
        this.dataFormatter.setApValues(data);
      } else {
        this.series = dataList.map(this.seriesHandler.bind(this));
        this.dataFormatter.setValues(data);
      }

    }
    this.data = data;

    this.updateThresholdData();

    if (this.data.length && this.panel.mapCenter === 'Last GeoHash') {
      this.centerOnLastGeoHash();
    } else {
      this.render();
    }
  }

  centerOnLastGeoHash() {
    const last: any = _.last(this.data);
    mapCenters[this.panel.mapCenter].mapCenterLatitude = last.locationLatitude;
    mapCenters[this.panel.mapCenter].mapCenterLongitude =
      last.locationLongitude;
    this.setNewMapCenter();
  }

  onDataSnapshotLoad(snapshotData) {
    this.onDataReceived(snapshotData);
  }

  resolveDatasourceType() {
    if (this.datasourceType !== undefined) {
      return this.datasourceType;
    } else {
      try {
        const ds = this.panel.datasource !== null ? this.panel.datasource : config.defaultDatasource;
        this.datasourceType = this.datasourceSrv.datasources[ds].meta.id;
        return this.datasourceType;
      } catch (err) {
        var e : any = new Error("Failed to resolve Datasource: " + err.message);
        e.origError = err;
        throw e;
      }
    }
  }

  buildColumnMap(columns) {
    var required_columns = ['Time', 'id', 'location', 'targetEnvironment', 'status'];
    var columnMap = {};
    for (var i = 0; i < columns.length; i++) {
      var cName = columns[i].text;
      var idx = required_columns.indexOf(cName);
      if (idx > -1) {
        columnMap[cName] = i;
        required_columns.splice(idx, 1);
      }
    }

    if (required_columns.length === 0) {
      return columnMap;
    }
    throw 'Invalid columns received. Required: <' + required_columns.toString() + '>';
  }

  processAPInfluxTableData(dataList) {

    const regions : any[] = [];
    dataList.forEach(element => {

      var columnMap = this.buildColumnMap(element.columns);
      // ensure we are not dealing with something not AP related
      if (!columnMap) {
        return; // this is continue actually
      }

      element.rows.forEach(row => {

        const id = row[columnMap['id']];
        const location = row[columnMap['location']];
        const targetEnvironment = row[columnMap['targetEnvironment']];
        const isKO = row[columnMap['status']] === 0;

        if (id === '' || location === '' || targetEnvironment === '') {
          const timeStamp = row[columnMap['Time']];
          console.log('Skipping row at <' + new Date(timeStamp).toISOString() + '>! id, location or targetEnvironment are mandatory.');
          return;
        }

        let region : any  = regions.find((r : any) => location === r.name);
        if (region === undefined) {
          region = {
            name: location,
            ids: [],
            failedIds: [],
            environments: {}
          };
          regions.push(region);
        }

        const idExists = region.ids.includes(id);
        if (!idExists) {
          region.ids.push(id);
        }
        if (isKO) {
          if (!region.failedIds.includes(id)) {
            region.failedIds.push(id);
          }
        }

        if (targetEnvironment !== undefined) {
          if (region.environments[targetEnvironment]) {
            region.environments[targetEnvironment] = region.environments[targetEnvironment] + 1;
          } else {
            region.environments[targetEnvironment] = 1;
          }
        }
      });
    });
    return regions;
  }

  processAPESData(dataList) {
    const regions : any[] = [];

    dataList.forEach(element => {
      // ensure we are not dealing with something not AP related
      if (!element.target || !element.props["location.keyword"] || !element.props["id.keyword"]) {
        return; // this is continue actually
      }

      const location = element.props["location.keyword"];
      const targetEnvironment = element.props["targetEnvironment.keyword"];
      const id = element.props["id.keyword"];
      const isKO = element.target.endsWith("KO");

      // find region
      let region : any = regions.find((r : any) => location == r.name);
      if (region === undefined) {
        region = {
          name: location,
          ids: [],
          failedIds: [],
          environments: {}
        };
        regions.push(region);
      }

      // resolve if ID has been processed
      const idExists = region.ids.includes(id);
      if (!idExists) {
        region.ids.push(id);
      }

      if (!isKO) {
        if (targetEnvironment !== undefined) {
          if (region.environments[targetEnvironment]) {
            region.environments[targetEnvironment] = region.environments[targetEnvironment] + 1;
          } else {
            region.environments[targetEnvironment] = 1;
          }
        }
      }

      // in case of KO need to understand if it fails
      if (isKO) {
        // first find the OK equivalent
        const allTarget = element.target.replace('__KO', '__ALL');
        const allElement = dataList.find(d => d.target == allTarget);
        // if we can not find than it's serious error
        if (allElement === undefined) {
          console.error('Unable to locate the ' + allTarget + ' data series.');
        } else {
          for (let index = 0; index < element.datapoints.length; index++) {
            const failingInstances = element.datapoints[index][0];
            const allInstances = allElement.datapoints[index][0];
            if (failingInstances === allInstances) {
              region.failedIds.push(id);
              break;
            }
          }
        }
      }
    });

    return regions;
  }

  processApData(dataList) {
    const dsType = this.resolveDatasourceType();
    switch (dsType) {
      case 'influxdb':
        return this.processAPInfluxTableData(dataList);
      case 'elasticsearch':
        return this.processAPESData(dataList);
      default:
        throw 'Unsupported datasource <' + dsType + '>';
    }
  }

  apSeriesHandler(region) {
    const total = region.ids.length;
    const failing = region.failedIds.length;
    const successRate = ((total - failing) / total * 100).toFixed(0);

    const series = new TimeSeries({
      datapoints: [],
      alias: region.name
    });

    series.stats = {
      successRate: successRate,
      totalProbes: total,
      failingProbes: failing,
      failingProbesNames: region.failedIds,
      targetEnvironments: region.environments
    }

    return series;
  }

  seriesHandler(seriesData) {
    const series = new TimeSeries({
      datapoints: seriesData.datapoints,
      alias: seriesData.target
    });

    series.flotpairs = series.getFlotPairs(this.panel.nullPointMode);
    return series;
  }

  setNewMapCenter() {
    if (this.panel.mapCenter !== "custom") {
      this.panel.mapCenterLatitude =
        mapCenters[this.panel.mapCenter].mapCenterLatitude;
      this.panel.mapCenterLongitude =
        mapCenters[this.panel.mapCenter].mapCenterLongitude;
    }
    this.mapCenterMoved = true;
    this.render();
  }

  setZoom() {
    this.map.setZoom(this.panel.initialZoom || 1);
  }

  toggleLegend() {
    if (!this.panel.showLegend) {
      this.map.removeLegend();
    }
    this.render();
  }

  toggleMouseWheelZoom() {
    this.map.setMouseWheelZoom();
    this.render();
  }

  toggleStickyLabels() {
    this.map.clearCircles();
    this.render();
  }

  changeThresholds() {
    this.updateThresholdData();
    this.map.legend.update();
    this.render();
  }

  updateThresholdData() {
    this.data.thresholds = this.panel.thresholds.split(",").map(strValue => {
      return Number(strValue.trim());
    });
    while (_.size(this.panel.colors) > _.size(this.data.thresholds) + 1) {
      // too many colors. remove the last one.
      this.panel.colors.pop();
    }
    while (_.size(this.panel.colors) < _.size(this.data.thresholds) + 1) {
      // not enough colors. add one.
      const newColor = "rgba(50, 172, 45, 0.97)";
      this.panel.colors.push(newColor);
    }
  }

  changeLocationData() {
    this.loadLocationDataFromFile(true);

    if (this.panel.locationData === "geohash") {
      this.render();
    }
  }

  link(scope, elem, attrs, ctrl) {
    ctrl.events.on("render", () => {
      render();
      ctrl.renderingCompleted();
    });

    function render() {
      if (!ctrl.data) {
        return;
      }

      const mapContainer = elem.find(".mapcontainer");

      if (mapContainer[0].id.indexOf("{{") > -1) {
        return;
      }

      if (!ctrl.map) {
        const map = new WorldMap(ctrl, mapContainer[0]);
        map.createMap();
        ctrl.map = map;
      }

      setTimeout(() => {
        ctrl.map.resize();
        ctrl.map.drawCircles();
      }, 2000);

      if (ctrl.mapCenterMoved) {
        ctrl.map.panToMapCenter();
      }

      if (!ctrl.map.legend && ctrl.panel.showLegend) {
        ctrl.map.createLegend();
      }

      ctrl.map.drawCircles();
    }
  }
}
