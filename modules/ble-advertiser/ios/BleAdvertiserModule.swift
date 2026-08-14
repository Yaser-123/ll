import ExpoModulesCore
import CoreBluetooth

/**
 * BleAdvertiserModule — iOS BLE Peripheral (advertiser) for Lifeline.
 *
 * Uses CBPeripheralManager to broadcast:
 *   - A custom 128-bit Lifeline service UUID (for scanner filtering)
 *   - A CBAdvertisementDataLocalNameKey with the Lifeline-encoded identity string
 *     (does NOT change the system Bluetooth name — iOS separates these cleanly)
 *
 * Foreground-only: iOS suspends BLE peripheral advertising when the app is
 * backgrounded (unless the app has the bluetooth-peripheral UIBackgroundMode
 * entitlement, which requires App Store review). This is acceptable for
 * an initial discovery module.
 *
 * Called from JS via: BleAdvertiser.startAdvertising(serviceUuid, localName)
 */
public class BleAdvertiserModule: Module, CBPeripheralManagerDelegate {

    private var peripheralManager: CBPeripheralManager?
    private var pendingServiceUUID: CBUUID?
    private var pendingLocalName: String?
    private var isAdvertising = false
    
    private let messagingServiceUUID = CBUUID(string: "6C696665-6C69-6E65-0002-000000000001")
    private let writeCharacteristicUUID = CBUUID(string: "6C696665-6C69-6E65-0003-000000000001")
    private var writeCharacteristic: CBMutableCharacteristic?

    // MARK: - Expo Module Definition

    public func definition() -> ModuleDefinition {
        Name("BleAdvertiser")
        
        Events("onMessageReceived")

        /**
         * Start BLE peripheral advertising.
         *
         * If CBPeripheralManager hasn't been created yet, creates it and
         * advertising begins as soon as BT state reports poweredOn.
         *
         * @param serviceUuid  128-bit UUID string (8-4-4-4-12 format)
         * @param localName    Lifeline identity string, e.g. "LF:6C6966656C69:Alpha-1337"
         */
        AsyncFunction("startAdvertising") { (serviceUuid: String, localName: String) in
            self.pendingServiceUUID = CBUUID(string: serviceUuid)
            self.pendingLocalName = localName

            if self.peripheralManager == nil {
                // Create manager — delegate callback triggers advertising once powered on
                self.peripheralManager = CBPeripheralManager(
                    delegate: self,
                    queue: DispatchQueue.main,
                    options: [CBPeripheralManagerOptionShowPowerAlertKey: true]
                )
            } else if self.peripheralManager?.state == .poweredOn {
                self.startAdvertisingInternal()
            }
        }

        /**
         * Stop BLE peripheral advertising and release the CBPeripheralManager.
         * Safe to call even if advertising was never started.
         */
        AsyncFunction("stopAdvertising") {
            self.peripheralManager?.stopAdvertising()
            self.peripheralManager?.removeAllServices()
            self.peripheralManager = nil
            self.pendingServiceUUID = nil
            self.pendingLocalName = nil
            self.isAdvertising = false
            self.writeCharacteristic = nil
        }
    }

    // MARK: - CBPeripheralManagerDelegate

    public func peripheralManagerDidUpdateState(_ peripheral: CBPeripheralManager) {
        switch peripheral.state {
        case .poweredOn:
            if !isAdvertising {
                startAdvertisingInternal()
            }
        case .poweredOff:
            print("[BleAdvertiser] Bluetooth is powered off — cannot advertise.")
            isAdvertising = false
        case .unauthorized:
            print("[BleAdvertiser] Bluetooth permission not granted.")
            isAdvertising = false
        case .unsupported:
            print("[BleAdvertiser] BLE not supported on this device.")
            isAdvertising = false
        case .resetting:
            print("[BleAdvertiser] Bluetooth is resetting...")
            isAdvertising = false
        default:
            break
        }
    }

    public func peripheralManagerDidStartAdvertising(
        _ peripheral: CBPeripheralManager,
        error: Error?
    ) {
        if let error = error {
            print("[BleAdvertiser] Failed to start advertising: \(error.localizedDescription)")
            isAdvertising = false
        } else {
            print("[BleAdvertiser] Advertising started. localName=\(pendingLocalName ?? "nil")")
            isAdvertising = true
        }
    }
    
    public func peripheralManager(_ peripheral: CBPeripheralManager, didReceiveWrite requests: [CBATTRequest]) {
        for request in requests {
            if request.characteristic.uuid == writeCharacteristicUUID {
                if let value = request.value, let payload = String(data: value, encoding: .utf8) {
                    print("[BleAdvertiser] GATT Server received message: \(payload)")
                    self.sendEvent("onMessageReceived", [
                        "payload": payload
                    ])
                }
                peripheralManager?.respond(to: request, withResult: .success)
            } else {
                peripheralManager?.respond(to: request, withResult: .writeNotPermitted)
            }
        }
    }

    // MARK: - Internal helpers

    private func startAdvertisingInternal() {
        guard let serviceUUID = pendingServiceUUID,
              let localName = pendingLocalName else {
            print("[BleAdvertiser] startAdvertisingInternal called without pending data.")
            return
        }

        // iOS BLE advertisement payload for peripheral role:
        //   - service UUID → BLE scanners can filter on this
        //   - local name   → encoded Lifeline identity (no system BT name change)
        let advertisingData: [String: Any] = [
            CBAdvertisementDataServiceUUIDsKey: [serviceUUID],
            CBAdvertisementDataLocalNameKey: localName,
        ]

        // Setup GATT Server for messaging
        if writeCharacteristic == nil {
            let char = CBMutableCharacteristic(
                type: writeCharacteristicUUID,
                properties: [.write],
                value: nil,
                permissions: [.writeable]
            )
            writeCharacteristic = char
            
            let service = CBMutableService(type: messagingServiceUUID, primary: true)
            service.characteristics = [char]
            peripheralManager?.add(service)
        }

        peripheralManager?.startAdvertising(advertisingData)
    }
}
