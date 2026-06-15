import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Alert, Avatar, Badge, Button, Card, Col, ConfigProvider, Divider, Empty, Flex, Form, Input, List, message, Progress, Row, Segmented, Select, Slider, Space, Spin, Statistic, Tag, Tooltip, Typography } from "antd";
import {
  AimOutlined,
  AppstoreOutlined,
  CarOutlined,
  CheckCircleOutlined,
  CopyOutlined,
  EnvironmentOutlined,
  FieldTimeOutlined,
  FlagOutlined,
  ReloadOutlined,
  ShareAltOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import "antd/dist/reset.css";
import "./styles.css";

const { Text, Title, Paragraph } = Typography;

const COLORS = ["#1677ff", "#13a8a8", "#fa8c16", "#722ed1", "#eb2f96", "#52c41a", "#d48806"];
const TAG_OPTIONS = ["餐饮", "咖啡", "地铁直达", "停车场", "包间", "宠物友好", "无烟区", "无障碍", "预算友好", "当前营业"];
const PLACE_TYPES = ["餐厅", "咖啡", "KTV", "电影院", "公园", "剧本杀"];
const TRANSPORT_LABELS = {
  driving: "驾车",
  transit: "公交/地铁",
  subway: "地铁优先",
  walking: "步行",
};
const TRANSPORT_SPEEDS = {
  driving: 28,
  transit: 20,
  subway: 27,
  walking: 4.6,
};
const ROUTE_PLUGINS = ["AMap.Driving", "AMap.Transfer", "AMap.Walking"];

const seedMembers = [
  {
    id: "m1",
    name: "林夏",
    address: "虹桥天地",
    lng: 121.3207,
    lat: 31.1944,
    fuzzy: false,
    transport: "transit",
    must: ["餐饮", "地铁直达"],
    nice: ["包间", "无烟区"],
  },
  {
    id: "m2",
    name: "王屿",
    address: "静安寺",
    lng: 121.4453,
    lat: 31.2231,
    fuzzy: false,
    transport: "subway",
    must: ["餐饮", "地铁直达"],
    nice: ["预算友好", "当前营业"],
  },
  {
    id: "m3",
    name: "陈橙",
    address: "陆家嘴",
    lng: 121.5074,
    lat: 31.2352,
    fuzzy: true,
    transport: "driving",
    must: ["餐饮"],
    nice: ["停车场", "包间"],
  },
  {
    id: "m4",
    name: "赵一",
    address: "五角场",
    lng: 121.5148,
    lat: 31.3036,
    fuzzy: false,
    transport: "transit",
    must: ["餐饮", "地铁直达"],
    nice: ["无烟区", "当前营业"],
  },
];

function readStorage(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(`jzd:${key}`)) || fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(`jzd:${key}`, JSON.stringify(value));
}

function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

function computeCenter(members) {
  if (!members.length) return { lng: 121.4737, lat: 31.2304 };
  const sum = members.reduce(
    (acc, member) => ({ lng: acc.lng + member.lng, lat: acc.lat + member.lat }),
    { lng: 0, lat: 0 },
  );
  return {
    lng: Number((sum.lng / members.length).toFixed(6)),
    lat: Number((sum.lat / members.length).toFixed(6)),
  };
}

function haversineKm(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const lat1 = a.lat * rad;
  const lat2 = b.lat * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function toLngLat(point) {
  if (!point) return null;
  if (Array.isArray(point)) return [point[0], point[1]];
  if (typeof point.lng === "number" && typeof point.lat === "number") return [point.lng, point.lat];
  if (typeof point.getLng === "function" && typeof point.getLat === "function") return [point.getLng(), point.getLat()];
  return null;
}

function extractStepPath(steps = []) {
  return steps.flatMap((step) => (step.path || []).map(toLngLat).filter(Boolean));
}

function extractTransferPath(plan) {
  return (plan?.segments || []).flatMap((segment) => {
    const walkingPath = extractStepPath(segment.walking?.steps || []);
    const transitPath = (segment.transit?.path || segment.transit?.via_stops || []).map(toLngLat).filter(Boolean);
    return [...walkingPath, ...transitPath];
  });
}

function parseLngLat(value) {
  const match = String(value).match(/(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)/);
  if (!match) return null;
  const lng = Number(match[1]);
  const lat = Number(match[2]);
  return Number.isFinite(lng) && Number.isFinite(lat) ? { lng, lat } : null;
}

function venueTagsFor(type, index) {
  const base = {
    餐厅: ["餐饮", "地铁直达", "包间", "当前营业"],
    咖啡: ["咖啡", "地铁直达", "无烟区", "当前营业"],
    KTV: ["KTV", "包间", "停车场", "当前营业"],
    电影院: ["影院", "地铁直达", "停车场", "无障碍"],
    公园: ["公园", "宠物友好", "无障碍", "预算友好"],
    剧本杀: ["剧本杀", "包间", "无烟区", "当前营业"],
  };
  const extras = ["预算友好", "停车场", "宠物友好", "无烟区", "无障碍"];
  return [...new Set([...(base[type] || base["餐厅"]), extras[index % extras.length]])];
}

function fallbackVenues(center, placeType) {
  const names = {
    餐厅: ["衡山路围炉餐厅", "南京西路聚餐小馆", "苏河湾融合菜", "人民广场精酿餐吧", "淮海路日料食堂", "静安共享餐桌"],
    咖啡: ["苏州河手冲咖啡", "静安阳光咖啡", "愚园路咖啡局", "人民公园咖啡站", "新天地夜咖啡", "衡复社区咖啡"],
    KTV: ["静安欢唱空间", "人民广场 K 歌局", "淮海路包厢 KTV", "黄浦夜唱馆", "苏河湾音乐房", "南京西路 KTV"],
    电影院: ["静安光影中心", "人民广场影院", "淮海路电影公社", "苏河湾影城", "新天地影院", "长宁艺术影院"],
    公园: ["中山公园草坪", "静安雕塑公园", "人民公园", "苏州河步道", "复兴公园", "徐家汇公园"],
    剧本杀: ["静安推理社", "人民广场剧本局", "长乐路沉浸剧场", "苏河湾谜案馆", "淮海路推理空间", "新天地剧本社"],
  };
  const offsets = [
    [-0.012, 0.006],
    [0.007, -0.009],
    [0.016, 0.012],
    [-0.018, -0.012],
    [0.002, 0.019],
    [0.022, -0.004],
  ];
  return offsets.map(([lngOffset, latOffset], index) => ({
    id: uid("venue"),
    name: names[placeType][index],
    address: "折中点附近推荐商圈",
    lng: Number((center.lng + lngOffset).toFixed(6)),
    lat: Number((center.lat + latOffset).toFixed(6)),
    rating: Number((4.4 + (index % 4) * 0.1).toFixed(1)),
    price: 80 + index * 22,
    tags: venueTagsFor(placeType, index),
    votes: index === 0 ? 2 : index === 1 ? 1 : 0,
    source: "demo",
  }));
}

function App() {
  const [messageApi, contextHolder] = message.useMessage();
  const [form] = Form.useForm();
  const [members, setMembers] = useState(() => readStorage("members", seedMembers));
  const [venues, setVenues] = useState([]);
  const [selectedVenueId, setSelectedVenueId] = useState("");
  const [placeType, setPlaceType] = useState("餐厅");
  const [radius, setRadius] = useState(3);
  const [globalTransport, setGlobalTransport] = useState("member");
  const [routeMode, setRouteMode] = useState("路线");
  const [mustDraft, setMustDraft] = useState(["餐饮"]);
  const [niceDraft, setNiceDraft] = useState(["地铁直达", "包间"]);
  const [amapKey, setAmapKey] = useState(() => localStorage.getItem("jzd:amapKey") || "");
  const [amapSecurity, setAmapSecurity] = useState(() => localStorage.getItem("jzd:amapSecurity") || "");
  const [mapReady, setMapReady] = useState(false);
  const [mapStatus, setMapStatus] = useState(amapKey ? "待加载" : "模拟地图");
  const [routeCache, setRouteCache] = useState({});
  const [routeLoading, setRouteLoading] = useState(false);
  const mapRef = useRef(null);
  const layersRef = useRef([]);

  const center = useMemo(() => computeCenter(members), [members]);

  const commonMust = useMemo(() => {
    if (!members.length) return [];
    return members.map((member) => member.must).reduce((common, tags) => common.filter((tag) => tags.includes(tag)));
  }, [members]);

  const niceCounts = useMemo(() => {
    const counts = {};
    members.forEach((member) => {
      member.nice.forEach((tag) => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return counts;
  }, [members]);

  function getTransport(member) {
    return globalTransport === "member" ? member.transport : globalTransport;
  }

  function estimateRoute(member, venue) {
    const mode = getTransport(member);
    const distance = haversineKm(member, venue);
    const detour = mode === "walking" ? 1.12 : mode === "driving" ? 1.28 : 1.42;
    const km = distance * detour;
    const minutes = Math.max(6, Math.round((km / TRANSPORT_SPEEDS[mode]) * 60 + (mode === "driving" ? 6 : 9)));
    return {
      memberId: member.id,
      memberName: member.name,
      mode,
      km: Number(km.toFixed(1)),
      minutes,
      source: "estimate",
      path: [
        [member.lng, member.lat],
        [venue.lng, venue.lat],
      ],
    };
  }

  function scoreVenue(venue) {
    const cachedRoutes = routeCache[venue.id];
    const cachedRoutesValid =
      cachedRoutes?.length === members.length &&
      cachedRoutes.every((route, index) => route.cacheKey === routeCacheKey(members[index], venue));
    const routes = cachedRoutesValid ? cachedRoutes : members.map((member) => estimateRoute(member, venue));
    const totalMinutes = routes.reduce((sum, route) => sum + route.minutes, 0);
    const maxMinutes = Math.max(...routes.map((route) => route.minutes));
    const mustHits = commonMust.filter((tag) => venue.tags.includes(tag)).length;
    const niceScore = Object.entries(niceCounts).reduce((sum, [tag, count]) => sum + (venue.tags.includes(tag) ? count : 0), 0);
    const score = Math.round(100 - totalMinutes * 0.18 - maxMinutes * 0.22 + mustHits * 9 + niceScore * 2.5 + venue.rating * 3);
    return { ...venue, routes, totalMinutes, maxMinutes, matchScore: Math.max(0, score) };
  }

  const rankedVenues = useMemo(
    () => venues.map(scoreVenue).sort((a, b) => b.matchScore - a.matchScore || a.totalMinutes - b.totalMinutes),
    [venues, members, commonMust, niceCounts, globalTransport, routeCache],
  );

  const selectedVenue = useMemo(
    () => rankedVenues.find((venue) => venue.id === selectedVenueId) || rankedVenues[0],
    [rankedVenues, selectedVenueId],
  );

  const winningVenue = useMemo(
    () => rankedVenues.slice().sort((a, b) => (b.votes || 0) - (a.votes || 0))[0] || selectedVenue,
    [rankedVenues, selectedVenue],
  );

  useEffect(() => {
    writeStorage("members", members);
  }, [members]);

  useEffect(() => {
    regenerateDemoVenues();
  }, []);

  useEffect(() => {
    renderAmap();
  }, [mapReady, members, rankedVenues, selectedVenueId, radius, routeMode]);

  useEffect(() => {
    if (!mapReady || !selectedVenue) return;
    planSelectedVenueRoutes(selectedVenue);
  }, [mapReady, selectedVenueId, selectedVenue?.lng, selectedVenue?.lat, members, globalTransport]);

  function regenerateDemoVenues() {
    const nextVenues = fallbackVenues(center, placeType);
    setVenues(nextVenues);
    setSelectedVenueId(nextVenues[0]?.id || "");
  }

  function randomNearCenter(address) {
    const jitter = () => (Math.random() - 0.5) * 0.08;
    return {
      lng: Number((center.lng + jitter()).toFixed(6)),
      lat: Number((center.lat + jitter()).toFixed(6)),
      address,
    };
  }

  function resolveAddress(address) {
    const coords = parseLngLat(address);
    if (coords) return Promise.resolve({ ...coords, address });
    if (mapReady && window.AMap) {
      return new Promise((resolve) => {
        window.AMap.plugin(["AMap.PlaceSearch"], () => {
          const placeSearch = new window.AMap.PlaceSearch({ city: "全国", pageSize: 1 });
          placeSearch.search(address, (status, result) => {
            const poi = result?.poiList?.pois?.[0];
            if (status === "complete" && poi?.location) {
              resolve({ lng: poi.location.lng, lat: poi.location.lat, address: poi.name || address });
            } else {
              resolve(randomNearCenter(address));
            }
          });
        });
      });
    }
    return Promise.resolve(randomNearCenter(address));
  }

  async function addMember(values) {
    const location = await resolveAddress(values.address);
    setMembers((current) => [
      ...current,
      {
        id: uid("member"),
        name: values.name,
        address: location.address,
        lng: location.lng,
        lat: location.lat,
        fuzzy: values.fuzzyMode === "fuzzy",
        transport: values.transport,
        must: mustDraft,
        nice: niceDraft,
      },
    ]);
    form.resetFields();
    setMustDraft(["餐饮"]);
    setNiceDraft(["地铁直达", "包间"]);
    messageApi.success("成员已加入，折中点已更新");
  }

  function removeMember(id) {
    setMembers((current) => current.filter((member) => member.id !== id));
  }

  function voteVenue(id) {
    setVenues((current) => current.map((venue) => (venue.id === id ? { ...venue, votes: (venue.votes || 0) + 1 } : venue)));
    setSelectedVenueId(id);
  }

  function copyText(text, label) {
    navigator.clipboard?.writeText(text).then(
      () => messageApi.success(`${label}已复制`),
      () => messageApi.warning("当前浏览器不允许自动复制"),
    );
  }

  function resultText() {
    if (!winningVenue) return "聚中点：还没有生成推荐。";
    const routes = winningVenue.routes.map((route) => `${route.memberName} ${route.minutes}min/${route.km}km`).join("，");
    return `聚中点推荐：${winningVenue.name}\n地址：${winningVenue.address}\n票数：${winningVenue.votes || 0}\n通勤：${routes}`;
  }

  function routeCacheKey(member, venue) {
    return `${venue.id}:${member.id}:${getTransport(member)}:${member.lng},${member.lat}:${venue.lng},${venue.lat}`;
  }

  function createRouteService(mode) {
    if (mode === "driving") {
      return new window.AMap.Driving({
        policy: window.AMap.DrivingPolicy?.LEAST_TIME,
        hideMarkers: true,
        autoFitView: false,
      });
    }
    if (mode === "walking") {
      return new window.AMap.Walking({
        hideMarkers: true,
        autoFitView: false,
      });
    }
    return new window.AMap.Transfer({
      city: "上海市",
      cityd: "上海市",
      policy: mode === "subway" ? window.AMap.TransferPolicy?.LEAST_TRANSFER : window.AMap.TransferPolicy?.LEAST_TIME,
      hideMarkers: true,
      autoFitView: false,
    });
  }

  function normalizeRouteResult(member, venue, mode, result) {
    if (mode === "driving" || mode === "walking") {
      const route = result?.routes?.[0];
      if (!route) return estimateRoute(member, venue);
      const path = extractStepPath(route.steps || []);
      return {
        memberId: member.id,
        memberName: member.name,
        mode,
        km: Number(((route.distance || 0) / 1000).toFixed(1)),
        minutes: Math.max(1, Math.round((route.time || 0) / 60)),
        source: "amap",
        path: path.length ? path : estimateRoute(member, venue).path,
      };
    }

    const plan = result?.plans?.[0];
    if (!plan) return estimateRoute(member, venue);
    const path = extractTransferPath(plan);
    return {
      memberId: member.id,
      memberName: member.name,
      mode,
      km: Number(((plan.distance || 0) / 1000).toFixed(1)),
      minutes: Math.max(1, Math.round((plan.time || 0) / 60)),
      source: "amap",
      path: path.length ? path : estimateRoute(member, venue).path,
    };
  }

  function planRoute(member, venue) {
    const mode = getTransport(member);
    if (!window.AMap || !mapReady) return Promise.resolve(estimateRoute(member, venue));

    return new Promise((resolve) => {
      window.AMap.plugin(ROUTE_PLUGINS, () => {
        try {
          const service = createRouteService(mode);
          const origin = [member.lng, member.lat];
          const destination = [venue.lng, venue.lat];
          service.search(origin, destination, (status, result) => {
            if (status === "complete") {
              resolve(normalizeRouteResult(member, venue, mode, result));
            } else {
              resolve({ ...estimateRoute(member, venue), source: "fallback" });
            }
          });
        } catch {
          resolve({ ...estimateRoute(member, venue), source: "fallback" });
        }
      });
    });
  }

  async function planSelectedVenueRoutes(venue) {
    const expectedKeys = members.map((member) => routeCacheKey(member, venue));
    if (routeCache[venue.id]?.every((route, index) => route.cacheKey === expectedKeys[index])) return;
    setRouteLoading(true);
    const routes = await Promise.all(
      members.map(async (member) => ({
        ...(await planRoute(member, venue)),
        cacheKey: routeCacheKey(member, venue),
      })),
    );
    setRouteCache((current) => ({ ...current, [venue.id]: routes }));
    setRouteLoading(false);
  }

  function loadAmap() {
    if (!amapKey.trim()) {
      messageApi.warning("请先填写高德 Web Key");
      return;
    }
    localStorage.setItem("jzd:amapKey", amapKey.trim());
    localStorage.setItem("jzd:amapSecurity", amapSecurity.trim());
    window._AMapSecurityConfig = amapSecurity.trim() ? { securityJsCode: amapSecurity.trim() } : {};
    setMapStatus("加载中");
    if (window.AMap) {
      initAmap();
      return;
    }
    window.initJzdAmap = initAmap;
    const script = document.createElement("script");
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(amapKey.trim())}&plugin=AMap.PlaceSearch,AMap.Geolocation,${ROUTE_PLUGINS.join(",")}&callback=initJzdAmap`;
    script.onerror = () => {
      setMapStatus("加载失败");
      messageApi.error("高德地图加载失败，请检查 Key、服务绑定和网络");
    };
    document.head.appendChild(script);
  }

  function initAmap() {
    mapRef.current = new window.AMap.Map("amap-canvas", {
      zoom: 12,
      center: [center.lng, center.lat],
      resizeEnable: true,
      mapStyle: "amap://styles/normal",
    });
    setMapReady(true);
    setMapStatus("高德地图");
    messageApi.success("高德地图已加载");
  }

  function clearAmap() {
    if (!mapRef.current || !window.AMap) return;
    layersRef.current.filter(Boolean).forEach((layer) => mapRef.current.remove(layer));
    layersRef.current = [];
  }

  function renderAmap() {
    if (!mapReady || !window.AMap || !mapRef.current) return;
    clearAmap();
    const map = mapRef.current;
    map.setCenter([center.lng, center.lat]);

    const circle = new window.AMap.Circle({
      center: [center.lng, center.lat],
      radius: radius * 1000,
      strokeColor: "#1677ff",
      strokeOpacity: 0.45,
      strokeWeight: 1,
      fillColor: "#1677ff",
      fillOpacity: 0.08,
    });
    layersRef.current.push(circle);

    members.forEach((member, index) => {
      const marker = new window.AMap.Marker({
        position: [member.lng, member.lat],
        title: `${member.name} · ${member.address}`,
        content: `<div class="amap-member-dot" style="--member-color:${COLORS[index % COLORS.length]}"></div>`,
        offset: new window.AMap.Pixel(-7, -7),
      });
      layersRef.current.push(marker);
    });

    rankedVenues.forEach((venue, index) => {
      if (venue.id === selectedVenue?.id) return;
      const marker = new window.AMap.Marker({
        position: [venue.lng, venue.lat],
        title: venue.name,
        content: `<div class="amap-venue">${index + 1}</div>`,
        offset: new window.AMap.Pixel(-12, -12),
      });
      marker.on("click", () => setSelectedVenueId(venue.id));
      layersRef.current.push(marker);
    });

    if (selectedVenue) {
      const destination = new window.AMap.Marker({
        position: [selectedVenue.lng, selectedVenue.lat],
        draggable: true,
        title: "拖动更新目的地",
        content: `<div class="amap-destination"><span>中</span></div>`,
        offset: new window.AMap.Pixel(-19, -38),
      });
      destination.on("dragend", (event) => {
        setVenues((current) =>
          current.map((venue) =>
            venue.id === selectedVenue.id
              ? {
                  ...venue,
                  lng: event.lnglat.lng,
                  lat: event.lnglat.lat,
                  name: `${venue.name.replace("（已拖动）", "")}（已拖动）`,
                }
              : venue,
          ),
        );
      });
      layersRef.current.push(destination);

      if (routeMode === "路线") {
        members.forEach((member, index) => {
          const route = selectedVenue.routes.find((item) => item.memberId === member.id);
          layersRef.current.push(
            new window.AMap.Polyline({
              path: route?.path?.length ? route.path : [[member.lng, member.lat], [selectedVenue.lng, selectedVenue.lat]],
              strokeColor: COLORS[index % COLORS.length],
              strokeOpacity: 0.76,
              strokeWeight: 5,
              strokeStyle: route?.source === "amap" ? "solid" : "dashed",
            }),
          );
        });
      }
    }

    map.add(layersRef.current);
    const fitOverlays = layersRef.current.filter((layer) => layer.CLASS_NAME !== "AMap.Circle");
    if (fitOverlays.length > 1) map.setFitView(fitOverlays, false, [56, 56, 56, 56]);
  }

  function searchPoi() {
    if (!mapReady || !window.AMap) {
      regenerateDemoVenues();
      messageApi.info("未加载高德地图，已刷新示例 POI");
      return;
    }
    window.AMap.plugin(["AMap.PlaceSearch"], () => {
      const search = new window.AMap.PlaceSearch({ pageSize: 8, city: "全国" });
      search.searchNearBy(placeType, [center.lng, center.lat], radius * 1000, (status, result) => {
        const pois = result?.poiList?.pois || [];
        if (status !== "complete" || !pois.length) {
          regenerateDemoVenues();
          messageApi.warning("高德未返回 POI，已回退到示例推荐");
          return;
        }
        const nextVenues = pois.slice(0, 8).map((poi, index) => ({
          id: uid("amap"),
          name: poi.name,
          address: poi.address || poi.pname || "高德推荐地点",
          lng: poi.location.lng,
          lat: poi.location.lat,
          rating: Number((4.3 + (index % 5) * 0.1).toFixed(1)),
          price: 70 + index * 18,
          tags: venueTagsFor(placeType, index),
          votes: index === 0 ? 1 : 0,
          source: "amap",
        }));
        setVenues(nextVenues);
        setSelectedVenueId(nextVenues[0]?.id || "");
        messageApi.success("已更新高德周边 POI");
      });
    });
  }

  function locateMe() {
    if (!mapReady || !window.AMap) {
      messageApi.info("加载高德地图后可使用定位，也可以直接输入地址或经纬度");
      return;
    }
    window.AMap.plugin("AMap.Geolocation", () => {
      const geolocation = new window.AMap.Geolocation({ enableHighAccuracy: true, timeout: 8000 });
      geolocation.getCurrentPosition((status, result) => {
        if (status === "complete") {
          form.setFieldValue("address", `${result.position.lng},${result.position.lat}`);
          messageApi.success("已填入当前位置经纬度");
        } else {
          messageApi.warning("定位失败，可以手动输入地址");
        }
      });
    });
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#1677ff",
          colorSuccess: "#13a8a8",
          colorWarning: "#fa8c16",
          borderRadius: 8,
          fontFamily: 'Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
        },
        components: {
          Card: { headerBg: "#fff" },
          Button: { controlHeight: 38 },
          Input: { controlHeight: 38 },
          Select: { controlHeight: 38 },
        },
      }}
    >
      {contextHolder}
      <div className="app-shell">
        <main className="command-center">
          <header className="room-header">
            <Space size={14} align="center">
              <Avatar size={46} shape="square" icon={<EnvironmentOutlined />} className="brand-avatar" />
              <div>
                <Text type="secondary">地图工作台 · 房间 M829QZ</Text>
                <Title level={2}>周五下班小聚</Title>
              </div>
            </Space>
            <Space wrap>
              <Tooltip title="复制房间链接">
                <Button icon={<CopyOutlined />} onClick={() => copyText(`${location.origin}${location.pathname}#room=M829QZ`, "房间链接")} />
              </Tooltip>
              <Button type="primary" icon={<ReloadOutlined />} onClick={searchPoi}>
                生成推荐
              </Button>
            </Space>
          </header>

          <Row gutter={[12, 12]} className="metric-row">
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic title="成员" value={members.length} suffix="人" prefix={<TeamOutlined />} />
              </Card>
            </Col>
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic title="必选交集" value={commonMust.length} suffix="项" prefix={<CheckCircleOutlined />} />
              </Card>
            </Col>
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic title="候选地点" value={rankedVenues.length} suffix="个" prefix={<AppstoreOutlined />} />
              </Card>
            </Col>
            <Col xs={12} lg={6}>
              <Card size="small">
                <Statistic title="最长通勤" value={selectedVenue?.maxMinutes || 0} suffix="min" prefix={<FieldTimeOutlined />} />
              </Card>
            </Col>
          </Row>

          <Card
            title="成员位置与需求"
            extra={<Badge status="processing" text={`${members.length} 位已提交`} />}
            className="workspace-card"
          >
            <List
              className="member-list"
              dataSource={members}
              renderItem={(member, index) => (
                <List.Item
                  actions={[
                    <Button key="remove" size="small" danger onClick={() => removeMember(member.id)}>
                      移除
                    </Button>,
                  ]}
                >
                  <List.Item.Meta
                    avatar={<Avatar style={{ background: COLORS[index % COLORS.length] }}>{member.name.slice(0, 1)}</Avatar>}
                    title={
                      <Space wrap>
                        <Text strong>{member.name}</Text>
                        <Tag icon={<CarOutlined />}>{TRANSPORT_LABELS[member.transport]}</Tag>
                        {member.fuzzy && <Tag color="gold">模糊位置</Tag>}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={6}>
                        <Text type="secondary">{member.address}</Text>
                        <Space size={[4, 4]} wrap>
                          {member.must.map((tag) => (
                            <Tag color="blue" key={`${member.id}-must-${tag}`}>
                              必选 {tag}
                            </Tag>
                          ))}
                          {member.nice.map((tag) => (
                            <Tag key={`${member.id}-nice-${tag}`}>{tag}</Tag>
                          ))}
                        </Space>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />

            <Divider />

            <Form
              form={form}
              layout="vertical"
              onFinish={addMember}
              initialValues={{ transport: "transit", fuzzyMode: "precise" }}
              className="member-form"
            >
              <Row gutter={12}>
                <Col xs={24} md={8}>
                  <Form.Item label="昵称" name="name" rules={[{ required: true, message: "请输入昵称" }]}>
                    <Input maxLength={10} placeholder="如：小林" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="交通方式" name="transport">
                    <Select
                      options={Object.entries(TRANSPORT_LABELS).map(([value, label]) => ({ value, label }))}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item label="模糊位置" name="fuzzyMode">
                    <Segmented block options={[{ label: "精确", value: "precise" }, { label: "模糊", value: "fuzzy" }]} />
                  </Form.Item>
                </Col>
                <Col xs={24}>
                  <Form.Item label="出发地" name="address" rules={[{ required: true, message: "请输入地址或经纬度" }]}>
                    <Input.Search
                      placeholder="搜索地址、地标，或输入 121.47,31.23"
                      enterButton={<Button icon={<AimOutlined />}>定位</Button>}
                      onSearch={locateMe}
                    />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="必选需求">
                    <Select mode="multiple" value={mustDraft} options={TAG_OPTIONS.map((tag) => ({ value: tag, label: tag }))} onChange={setMustDraft} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item label="可选偏好">
                    <Select mode="multiple" value={niceDraft} options={TAG_OPTIONS.map((tag) => ({ value: tag, label: tag }))} onChange={setNiceDraft} />
                  </Form.Item>
                </Col>
              </Row>
              <Flex justify="end">
                <Button type="primary" htmlType="submit">
                  添加成员
                </Button>
              </Flex>
            </Form>
          </Card>

          <Card title="筛选与候选地点" className="workspace-card">
            <Row gutter={[12, 12]} align="middle">
              <Col xs={24} md={7}>
                <Text strong>场所类型</Text>
                <Segmented block value={placeType} options={PLACE_TYPES} onChange={setPlaceType} className="control-segment" />
              </Col>
              <Col xs={24} md={6}>
                <Text strong>搜索半径</Text>
                <Slider min={1} max={8} step={0.5} value={radius} onChange={setRadius} tooltip={{ formatter: (value) => `${value}km` }} />
              </Col>
              <Col xs={24} md={6}>
                <Text strong>全局交通</Text>
                <Select
                  className="full-width"
                  value={globalTransport}
                  onChange={setGlobalTransport}
                  options={[
                    { value: "member", label: "使用成员设置" },
                    ...Object.entries(TRANSPORT_LABELS).map(([value, label]) => ({ value, label: `统一${label}` })),
                  ]}
                />
              </Col>
              <Col xs={24} md={5}>
                <Button block type="primary" icon={<ReloadOutlined />} onClick={searchPoi}>
                  刷新 POI
                </Button>
              </Col>
            </Row>

            <Alert
              className="need-alert"
              type="info"
              showIcon
              message={
                <Space wrap>
                  <Text strong>几何折中点</Text>
                  <Text code>{center.lng.toFixed(4)}, {center.lat.toFixed(4)}</Text>
                  {commonMust.map((tag) => (
                    <Tag color="blue" key={tag}>
                      共同必选 {tag}
                    </Tag>
                  ))}
                  {Object.entries(niceCounts)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 5)
                    .map(([tag, count]) => (
                      <Tag key={tag}>
                        {tag} × {count}
                      </Tag>
                    ))}
                </Space>
              }
            />

            <List
              className="venue-list"
              dataSource={rankedVenues}
              locale={{ emptyText: <Empty description="暂无候选地点" /> }}
              renderItem={(venue, index) => (
                <List.Item className={venue.id === selectedVenue?.id ? "venue-item selected" : "venue-item"}>
                  <div className="venue-rank">{index + 1}</div>
                  <div className="venue-main">
                    <Flex justify="space-between" gap={12} wrap>
                      <div>
                        <Space wrap>
                          <Text strong>{venue.name}</Text>
                          <Tag color={venue.source === "amap" ? "green" : "default"}>{venue.source === "amap" ? "高德 POI" : "示例 POI"}</Tag>
                        </Space>
                        <Paragraph type="secondary" className="venue-address">
                          {venue.address} · 评分 {venue.rating} · 人均 {venue.price} · 最长 {venue.maxMinutes} 分钟
                        </Paragraph>
                      </div>
                      <Space>
                        <Button onClick={() => setSelectedVenueId(venue.id)}>查看路线</Button>
                        <Button type="primary" ghost onClick={() => voteVenue(venue.id)}>
                          投票 {venue.votes || 0}
                        </Button>
                      </Space>
                    </Flex>
                    <Progress percent={Math.min(100, venue.matchScore)} size="small" strokeColor="#1677ff" />
                    <Space size={[4, 4]} wrap>
                      {venue.tags.map((tag) => (
                        <Tag key={`${venue.id}-${tag}`}>{tag}</Tag>
                      ))}
                      {venue.routes
                        .slice()
                        .sort((a, b) => b.minutes - a.minutes)
                        .slice(0, 3)
                        .map((route) => (
                          <Tag color={route.source === "amap" ? "green" : "processing"} key={`${venue.id}-${route.memberId}`}>
                            {route.memberName} {route.minutes}min{route.source === "amap" ? " · 高德" : ""}
                          </Tag>
                        ))}
                    </Space>
                  </div>
                </List.Item>
              )}
            />
          </Card>

          <Card
            title="分享结果卡片"
            className="workspace-card"
            extra={
              <Button icon={<ShareAltOutlined />} onClick={() => copyText(resultText(), "结果卡片")}>
                复制
              </Button>
            }
          >
            {winningVenue ? (
              <div className="result-card">
                <Space direction="vertical" size={10}>
                  <Tag color="blue" icon={<FlagOutlined />}>
                    最终建议
                  </Tag>
                  <Title level={3}>{winningVenue.name}</Title>
                  <Text type="secondary">
                    {winningVenue.address} · {winningVenue.votes || 0} 票领先 · 综合评分 {winningVenue.matchScore}
                  </Text>
                  <Space size={[6, 6]} wrap>
                    {winningVenue.routes
                      .slice()
                      .sort((a, b) => b.minutes - a.minutes)
                      .map((route) => (
                        <Tag color="geekblue" key={`result-${route.memberId}`}>
                          {route.memberName} {route.minutes}min / {route.km}km{route.source === "amap" ? " · 高德" : ""}
                        </Tag>
                      ))}
                  </Space>
                </Space>
              </div>
            ) : (
              <Empty description="生成推荐后会出现结果卡片" />
            )}
          </Card>
        </main>

        <aside className="map-dock">
          <Card
            title={
              <Space>
                <EnvironmentOutlined />
                <span>路线视图</span>
              </Space>
            }
            extra={<Tag color={mapReady ? "green" : "default"}>{mapStatus}</Tag>}
            className="map-card"
          >
            <Space.Compact block className="key-row">
              <Input.Password placeholder="高德 Web Key" value={amapKey} onChange={(event) => setAmapKey(event.target.value)} />
              <Input.Password placeholder="安全密钥" value={amapSecurity} onChange={(event) => setAmapSecurity(event.target.value)} />
              <Button type="primary" onClick={loadAmap}>
                加载
              </Button>
            </Space.Compact>
            <Flex justify="space-between" align="center" className="map-tools">
              <Segmented value={routeMode} options={["路线", "点位"]} onChange={setRouteMode} />
              <Text type="secondary">右侧固定 · {radius.toFixed(1)}km 范围</Text>
            </Flex>
            <div className="map-viewport">
              <div id="amap-canvas" className={mapReady ? "amap-canvas ready" : "amap-canvas"}>
                {!mapReady && <MockMap members={members} selectedVenue={selectedVenue} center={center} />}
              </div>
              <SelectedVenueFloat selectedVenue={selectedVenue} radius={radius} />
            </div>
            <RouteSummary selectedVenue={selectedVenue} members={members} loading={routeLoading} />
          </Card>
        </aside>
      </div>
    </ConfigProvider>
  );
}

function MockMap({ members, selectedVenue }) {
  return (
    <div className="mock-map">
      <span className="road road-one" />
      <span className="road road-two" />
      <span className="road road-three" />
      {members.slice(0, 6).map((member, index) => (
        <div className={`mock-pin pin-${index + 1}`} style={{ background: COLORS[index % COLORS.length] }} key={member.id}>
          {member.name.slice(0, 1)}
        </div>
      ))}
      <div className="mock-destination">中</div>
      <div className="mock-caption">
        <Text strong>{selectedVenue?.name || "候选地点"}</Text>
        <Text type="secondary">配置高德 Key 后显示真实地图和可拖动目的地</Text>
      </div>
    </div>
  );
}

function SelectedVenueFloat({ selectedVenue, radius }) {
  if (!selectedVenue) return null;
  const avgMinutes = selectedVenue.routes?.length
    ? Math.round(selectedVenue.routes.reduce((sum, route) => sum + route.minutes, 0) / selectedVenue.routes.length)
    : 0;
  const plannedCount = selectedVenue.routes?.filter((route) => route.source === "amap").length || 0;

  return (
    <div className="venue-float-card">
      <Space direction="vertical" size={6}>
        <Space size={8} wrap>
          <Tag color="blue">当前中间点</Tag>
          <Tag>{selectedVenue.source === "amap" ? "高德 POI" : "示例 POI"}</Tag>
        </Space>
        <Text strong>{selectedVenue.name}</Text>
        <Text type="secondary" className="venue-float-address">
          {selectedVenue.address}
        </Text>
        <Space size={[4, 4]} wrap>
          <Tag>平均 {avgMinutes}min</Tag>
          <Tag>最长 {selectedVenue.maxMinutes}min</Tag>
          <Tag>{radius.toFixed(1)}km 搜索圈</Tag>
          {plannedCount > 0 && <Tag color="green">{plannedCount} 条高德规划</Tag>}
        </Space>
      </Space>
    </div>
  );
}

function RouteSummary({ selectedVenue, members, loading }) {
  if (!selectedVenue) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无路线" />;
  }
  return (
    <Spin spinning={loading} tip="高德路径规划中">
      <List
        size="small"
        className="route-summary"
        dataSource={selectedVenue.routes}
        renderItem={(route) => {
          const index = members.findIndex((member) => member.id === route.memberId);
          const colorIndex = index >= 0 ? index : 0;
          const member = members[index];
          return (
            <List.Item className="route-row-item">
              <span className="route-dot" style={{ background: COLORS[colorIndex % COLORS.length] }} />
              <div className="route-row-copy">
                <Flex justify="space-between" gap={12}>
                  <Text strong>{route.memberName}</Text>
                  <Text strong>{route.minutes}min</Text>
                </Flex>
                <Text type="secondary">
                  从 {member?.address || "出发地"} 出发 · {TRANSPORT_LABELS[route.mode]} · {route.km}km · {route.source === "amap" ? "高德规划" : "估算"}
                </Text>
              </div>
            </List.Item>
          );
        }}
      />
    </Spin>
  );
}

createRoot(document.getElementById("root")).render(<App />);
