import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, FlatList, Keyboard } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Map,
  Camera,
  Marker,
  GeoJSONSource,
  Layer,
  OfflineManager,
} from '@maplibre/maplibre-react-native';
import { useLocalSearchParams } from 'expo-router';

import { Colors, Typography, Spacing, Radius, Shadow } from '../src/theme';
import { useLocationStore } from '../src/store/useLocationStore';
import { useDeviceStore } from '../src/store/useDeviceStore';
import { useSosStore } from '../src/store/useSosStore';
import { NetworkStatusBar } from '../src/components/NetworkStatusBar';

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap Contributors',
    },
  },
  layers: [
    {
      id: 'osm',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export default function MapScreen() {
  const { networkStatus, deviceId } = useDeviceStore();
  const { getSelfLocation } = useLocationStore();
  const { getActiveEvents } = useSosStore();

  const [mapReady, setMapReady] = useState(false);
  const [downloadModalVisible, setDownloadModalVisible] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [routeGeoJSON, setRouteGeoJSON] = useState<any>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedBbox, setSelectedBbox] = useState<[number, number, number, number] | null>(null);
  const [selectionGeoJSON, setSelectionGeoJSON] = useState<any>(null);

  const cameraRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const params = useLocalSearchParams<{ lat?: string; lng?: string; sosId?: string }>();

  const activeSosEvents = getActiveEvents();
  const myLoc = getSelfLocation(deviceId);

  const handleDownload = async () => {
    try {
      let boundsToDownload: [number, number, number, number];

      if (selectedBbox) {
        // Nominatim boundingbox: [southLat, northLat, westLng, eastLng]
        const [sLat, nLat, wLng, eLng] = selectedBbox.map(Number);
        boundsToDownload = [wLng, sLat, eLng, nLat];
      } else {
        const bounds = await mapRef.current?.getBounds();
        if (!bounds) return;
        boundsToDownload = bounds;
      }

      setDownloading(true);
      setProgress(0);

      const name = `pack-${Date.now()}`;
      await OfflineManager.createPack(
        {
          metadata: { name },
          mapStyle: 'https://raw.githubusercontent.com/Yaser-123/ll/main/assets/osm_style.json',
          minZoom: 0,
          maxZoom: 15,
          bounds: boundsToDownload,
        },
        (pack: any, status: any) => {
          if (status.percentage) setProgress(status.percentage);
          if (status.state === 'complete') {
            setDownloading(false);
            setDownloadModalVisible(false);
            alert('Region downloaded successfully!');
          }
        },
        (err: any) => {
          console.error(err);
          setDownloading(false);
          alert('Download failed.');
        }
      );
    } catch (e) {
      console.error(e);
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (mapReady) {
      if (params.lat && params.lng) {
        const destLat = parseFloat(params.lat);
        const destLng = parseFloat(params.lng);

        // Auto-center on SOS location
        cameraRef.current?.flyTo({
          center: [destLng, destLat],
          zoom: 15,
          duration: 1000,
        });

        // Calculate Route
        if (myLoc) {
          const fetchRoute = async () => {
            try {
              // Assume online and try to fetch. If it fails, fallback.
              const url = `http://router.project-osrm.org/route/v1/driving/${myLoc.longitude},${myLoc.latitude};${destLng},${destLat}?overview=full&geometries=geojson`;
              const res = await fetch(url);
              const data = await res.json();
              if (data.routes && data.routes.length > 0) {
                setRouteGeoJSON(data.routes[0].geometry);
                return;
              }
            } catch (e) {
              console.log('[Map] OSRM fetch failed, using fallback straight line');
            }
            
            // Fallback: Straight line
            setRouteGeoJSON({
              type: 'LineString',
              coordinates: [
                [myLoc.longitude, myLoc.latitude],
                [destLng, destLat],
              ],
            });
          };
          fetchRoute();
        }
      } else if (myLoc) {
        // Default center on user
        cameraRef.current?.flyTo({
          center: [myLoc.longitude, myLoc.latitude],
          zoom: 13,
          duration: 1000,
        });
      }
    }
  }, [mapReady, params.lat, params.lng, myLoc, networkStatus]);

  const searchRegion = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    Keyboard.dismiss();
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery)}&format=json&limit=5`;
      const res = await fetch(url, { headers: { 'User-Agent': 'LifeLine/1.0' } });
      const data = await res.json();
      setSearchResults(data);
    } catch (e) {
      console.error(e);
      alert('Search failed. Check your internet connection.');
    } finally {
      setIsSearching(false);
    }
  };

  const selectRegion = (item: any) => {
    setSearchResults([]);
    setSearchQuery(item.display_name);

    // Boundingbox is [southLat, northLat, westLng, eastLng]
    const bbox = item.boundingbox;
    if (bbox && bbox.length === 4) {
      setSelectedBbox(bbox);
      const [sLat, nLat, wLng, eLng] = bbox.map(Number);
      
      // Create GeoJSON polygon for visual feedback
      const polygon = {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [[
            [wLng, nLat],
            [eLng, nLat],
            [eLng, sLat],
            [wLng, sLat],
            [wLng, nLat], // close polygon
          ]],
        },
      };
      setSelectionGeoJSON(polygon);

      // Auto-center map on selected region
      cameraRef.current?.flyTo({
        center: [Number(item.lon), Number(item.lat)],
        zoom: 10,
        duration: 1000,
      });
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <NetworkStatusBar status={networkStatus} />

      <View style={styles.container}>
        {/* Search Bar Overlay */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search city or state to download..."
              placeholderTextColor={Colors.textSecondary}
              value={searchQuery}
              onChangeText={(text) => {
                setSearchQuery(text);
                if (text === '') {
                  setSearchResults([]);
                  setSelectedBbox(null);
                  setSelectionGeoJSON(null);
                }
              }}
              onSubmitEditing={searchRegion}
            />
            <TouchableOpacity style={styles.searchBtn} onPress={searchRegion}>
              <Text style={styles.searchBtnText}>{isSearching ? '...' : 'SEARCH'}</Text>
            </TouchableOpacity>
          </View>

          {searchResults.length > 0 && (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.place_id.toString()}
              style={styles.resultsList}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.resultItem} onPress={() => selectRegion(item)}>
                  <Text style={styles.resultText}>{item.display_name}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>

        <Map
          ref={mapRef}
          style={styles.map}
          mapStyle={OSM_STYLE as any}
          onDidFinishLoadingMap={() => setMapReady(true)}
        >
          <Camera
            ref={cameraRef}
            initialViewState={{
              zoom: myLoc ? 13 : 2,
              center: myLoc ? [myLoc.longitude, myLoc.latitude] : [0, 0]
            }}
          />

          {/* Render User Location */}
          {myLoc && (
            <Marker
              id="my-location"
              lngLat={[myLoc.longitude, myLoc.latitude]}
            >
              <View style={styles.myMarkerContainer}>
                <View style={styles.myMarker} />
              </View>
            </Marker>
          )}

          {/* Render Active SOS Events */}
          {activeSosEvents.map((event) => {
            if (!event.location) return null;
            return (
              <Marker
                key={event.id}
                id={`sos-${event.id}`}
                lngLat={[event.location.longitude, event.location.latitude]}
              >
                <View style={styles.sosMarkerContainer}>
                  <View style={styles.sosMarkerPulse} />
                  <View style={styles.sosMarkerInner} />
                </View>
              </Marker>
            );
          })}

          {/* Render Route */}
          {routeGeoJSON && (
            <GeoJSONSource id="route-source" data={routeGeoJSON}>
              <Layer
                id="route-layer"
                type="line"
                paint={{
                  lineColor: Colors.primary,
                  lineWidth: 4,
                  lineOpacity: 0.8,
                }}
              />
            </GeoJSONSource>
          )}

          {/* Render Selected Region Bounding Box */}
          {selectionGeoJSON && (
            <GeoJSONSource id="selection-source" data={selectionGeoJSON}>
              <Layer
                id="selection-line"
                type="line"
                paint={{
                  lineColor: '#00FF00',
                  lineWidth: 3,
                  lineOpacity: 0.8,
                  lineDasharray: [2, 2],
                }}
              />
            </GeoJSONSource>
          )}
        </Map>

        {/* Floating Controls */}
        <View style={styles.controlsOverlay}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => {
              if (deviceId && myLoc) {
                useLocationStore.getState().upsertLocation({
                  deviceId,
                  latitude: myLoc.latitude,
                  longitude: myLoc.longitude,
                  timestamp: new Date().toISOString(),
                  isSelf: true,
                });
                cameraRef.current?.flyTo({
                  center: [myLoc.longitude, myLoc.latitude],
                  zoom: 15,
                  duration: 1000
                });
              }
            }}
          >
            <Text style={styles.controlBtnText}>MY LOCATION</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.controlBtnPrimary}
            onPress={() => setDownloadModalVisible(true)}
          >
            <Text style={styles.controlBtnTextPrimary}>DOWNLOAD MAP</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Download Modal */}
      <Modal visible={downloadModalVisible} transparent animationType="slide" onRequestClose={() => !downloading && setDownloadModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>DOWNLOAD REGION</Text>
            <Text style={styles.modalSub}>
              {selectedBbox 
                ? `Download the selected region (${searchQuery}) for offline emergency use.`
                : `Download the currently visible map region for offline emergency use.`}
            </Text>

            {downloading ? (
              <View style={styles.progressContainer}>
                <Text style={styles.progressText}>Downloading... {Math.round(progress)}%</Text>
                <View style={styles.progressBar}>
                  <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
              </View>
            ) : (
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setDownloadModalVisible(false)}>
                  <Text style={styles.cancelBtnText}>CANCEL</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmBtn} onPress={handleDownload}>
                  <Text style={styles.confirmBtnText}>START DOWNLOAD</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flex: 1, backgroundColor: Colors.surface },
  map: { flex: 1 },

  myMarkerContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 150, 255, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  myMarker: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0096FF',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  sosMarkerContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosMarkerPulse: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 50, 50, 0.4)',
  },
  sosMarkerInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#FF3232',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },

  searchContainer: {
    position: 'absolute',
    top: Spacing.md,
    left: Spacing.md,
    right: Spacing.md,
    zIndex: 10,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    ...Shadow.md,
  },
  searchInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: Typography.size.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  searchBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    borderRadius: Radius.sm,
    marginLeft: Spacing.sm,
  },
  searchBtnText: {
    color: Colors.background,
    fontWeight: Typography.weight.bold,
    fontSize: Typography.size.sm,
  },
  resultsList: {
    maxHeight: 200,
    borderTopWidth: 1,
    borderTopColor: Colors.surfaceBorder,
  },
  resultItem: {
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBorder,
  },
  resultText: {
    color: Colors.textPrimary,
    fontSize: Typography.size.sm,
  },

  controlsOverlay: {
    position: 'absolute',
    bottom: Spacing.xl,
    left: Spacing.lg,
    right: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  controlBtn: {
    flex: 1,
    backgroundColor: Colors.surfaceElevated,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  controlBtnText: {
    color: Colors.textSecondary,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },
  controlBtnPrimary: {
    flex: 1,
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    borderRadius: Radius.full,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  controlBtnTextPrimary: {
    color: Colors.background,
    fontSize: Typography.size.sm,
    fontWeight: Typography.weight.bold,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    padding: Spacing.xl,
  },
  modalCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.xl,
    borderWidth: 1,
    borderColor: Colors.surfaceBorder,
  },
  modalTitle: {
    fontSize: Typography.size.lg,
    fontWeight: Typography.weight.bold,
    color: Colors.textPrimary,
    letterSpacing: 2,
    marginBottom: Spacing.sm,
  },
  modalSub: {
    fontSize: Typography.size.sm,
    color: Colors.textSecondary,
    marginBottom: Spacing.xl,
    lineHeight: 20,
  },
  progressContainer: {
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  progressText: {
    color: Colors.primary,
    fontSize: Typography.size.sm,
    marginBottom: Spacing.sm,
  },
  progressBar: {
    width: '100%',
    height: 8,
    backgroundColor: Colors.surfaceElevated,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.md,
  },
  cancelBtn: {
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
  },
  cancelBtnText: {
    color: Colors.textSecondary,
    fontWeight: Typography.weight.bold,
    fontSize: Typography.size.sm,
  },
  confirmBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.md,
  },
  confirmBtnText: {
    color: Colors.background,
    fontWeight: Typography.weight.bold,
    fontSize: Typography.size.sm,
  },
});
