import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Map,
  Camera,
  PointAnnotation,
  ShapeSource,
  LineLayer,
  OfflineManager,
  OfflinePackDownloadState,
} from '@maplibre/maplibre-react-native';
import { useLocalSearchParams } from 'expo-router';

import { Colors, Typography, Spacing, Radius } from '../src/theme';
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

  const cameraRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const params = useLocalSearchParams<{ lat?: string; lng?: string; sosId?: string }>();

  const activeSosEvents = getActiveEvents();
  const myLoc = getSelfLocation(deviceId);

  const handleDownload = async () => {
    try {
      const bounds = await mapRef.current?.getVisibleBounds();
      if (!bounds) return;

      setDownloading(true);
      setProgress(0);

      const name = `pack-${Date.now()}`;
      await OfflineManager.createPack(
        {
          name,
          styleURL: JSON.stringify(OSM_STYLE),
          minZoom: 0,
          maxZoom: 15,
          bounds: [
            [bounds[1][0], bounds[1][1]], // NE
            [bounds[0][0], bounds[0][1]], // SW
          ],
        },
        (pack: any, status: any) => {
          if (status.percentage) setProgress(status.percentage);
          if (status.state === OfflinePackDownloadState.Complete) {
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
        cameraRef.current?.setCamera({
          centerCoordinate: [destLng, destLat],
          zoomLevel: 15,
          animationDuration: 1000,
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
        cameraRef.current?.setCamera({
          centerCoordinate: [myLoc.longitude, myLoc.latitude],
          zoomLevel: 13,
          animationDuration: 1000,
        });
      }
    }
  }, [mapReady, params.lat, params.lng, myLoc, networkStatus]);

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <NetworkStatusBar status={networkStatus} />

      <View style={styles.container}>
        <Map
          ref={mapRef}
          style={styles.map}
          styleJSON={JSON.stringify(OSM_STYLE)}
          logoEnabled={false}
          attributionEnabled={true}
          attributionPosition={{ bottom: 8, right: 8 }}
          onDidFinishLoadingMap={() => setMapReady(true)}
        >
          <Camera
            ref={cameraRef}
            zoomLevel={myLoc ? 13 : 2}
            centerCoordinate={myLoc ? [myLoc.longitude, myLoc.latitude] : [0, 0]}
          />

          {/* Render User Location */}
          {myLoc && (
            <PointAnnotation
              id="my-location"
              coordinate={[myLoc.longitude, myLoc.latitude]}
            >
              <View style={styles.myMarkerContainer}>
                <View style={styles.myMarker} />
              </View>
            </PointAnnotation>
          )}

          {/* Render Active SOS Events */}
          {activeSosEvents.map((event) => {
            if (!event.location) return null;
            return (
              <PointAnnotation
                key={event.id}
                id={`sos-${event.id}`}
                coordinate={[event.location.longitude, event.location.latitude]}
              >
                <View style={styles.sosMarkerContainer}>
                  <View style={styles.sosMarkerPulse} />
                  <View style={styles.sosMarkerInner} />
                </View>
              </PointAnnotation>
            );
          })}

          {/* Render Route */}
          {routeGeoJSON && (
            <ShapeSource id="route-source" shape={routeGeoJSON}>
              <LineLayer
                id="route-layer"
                style={{
                  lineColor: Colors.primary,
                  lineWidth: 4,
                  lineOpacity: 0.8,
                }}
              />
            </ShapeSource>
          )}
        </Map>

        {/* Floating Controls */}
        <View style={styles.controlsOverlay}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => {
              if (myLoc) {
                cameraRef.current?.setCamera({
                  centerCoordinate: [myLoc.longitude, myLoc.latitude],
                  zoomLevel: 15,
                  animationDuration: 500,
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
              Download the currently visible map region for offline emergency use. (Approx 10-30MB)
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
