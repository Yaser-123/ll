package expo.modules.bleadvertiser

import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothGatt
import android.bluetooth.BluetoothGattCharacteristic
import android.bluetooth.BluetoothGattServer
import android.bluetooth.BluetoothGattServerCallback
import android.bluetooth.BluetoothGattService
import android.bluetooth.BluetoothDevice
import android.bluetooth.le.AdvertiseCallback
import android.bluetooth.le.AdvertiseData
import android.bluetooth.le.AdvertiseSettings
import android.bluetooth.le.BluetoothLeAdvertiser
import android.content.Context
import android.os.Build
import android.os.ParcelUuid
import android.util.Log
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.UUID

/**
 * BleAdvertiserModule — BLE Peripheral advertising for Lifeline.
 *
 * Uses Android's BluetoothLeAdvertiser to broadcast:
 *   - A custom 128-bit Lifeline service UUID (for scanner filtering)
 *   - The device's Lifeline-encoded local name in the scan response
 *     (temporarily replaces the BT adapter name, restored on stop)
 *
 * Requires:
 *   - BLUETOOTH_ADVERTISE (Android 12+ / API 31+)
 *   - BLUETOOTH + BLUETOOTH_ADMIN (API < 31)
 *   - Bluetooth must be powered on
 *
 * Called from JS via: BleAdvertiser.startAdvertising(serviceUuid, localName)
 */
class BleAdvertiserModule : Module() {

    private var advertiser: BluetoothLeAdvertiser? = null
    private var advertiseCallback: AdvertiseCallback? = null
    private var originalDeviceName: String? = null
    private var gattServer: BluetoothGattServer? = null

    override fun definition() = ModuleDefinition {
        Name("BleAdvertiser")
        
        Events("onMessageReceived")

        /**
         * Start advertising.
         *
         * @param serviceUuid  128-bit UUID string, e.g. "6C696665-6C69-6E65-0001-000000000001"
         * @param localName    Lifeline-encoded name, e.g. "LF:6C6966656C69:Alpha-1337"
         *                     This temporarily becomes the BT adapter name (for scan response).
         */
        AsyncFunction("startAdvertising") { serviceUuid: String, localName: String ->
            val context = requireNotNull(appContext.reactContext) {
                "React context is not available"
            }

            val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                ?: throw Exception("BluetoothManager not available on this device")

            val btAdapter = btManager.adapter
                ?: throw Exception("Bluetooth adapter not available on this device")

            if (!btAdapter.isEnabled) {
                throw Exception("Bluetooth is not enabled")
            }

            val leAdvertiser = btAdapter.bluetoothLeAdvertiser
                ?: throw Exception(
                    "BLE advertising is not supported on this device. " +
                    "Some low-end devices or emulators do not support BLE advertising."
                )

            // Save and set the adapter name — this embeds identity in the scan response
            // via setIncludeDeviceName(true). Original name is restored on stop().
            originalDeviceName = btAdapter.name
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    btAdapter.setName(localName.take(248)) // BT name max 248 bytes
                } else {
                    @Suppress("DEPRECATION")
                    btAdapter.name = localName.take(248)
                }
            } catch (e: SecurityException) {
                Log.w(TAG, "Cannot set BT device name: ${e.message}. Proceeding without name encoding.")
                originalDeviceName = null
            }

            // Advertisement settings — low power mode for battery efficiency
            val settings = AdvertiseSettings.Builder()
                .setAdvertiseMode(AdvertiseSettings.ADVERTISE_MODE_LOW_POWER)
                .setConnectable(false)         // Discovery only, no connection needed
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                .setTimeout(0)                  // Advertise indefinitely until stopped
                .build()

            // Main advertisement packet — contains only the service UUID
            // This is what scanners filter on to identify Lifeline devices
            val advertiseData = AdvertiseData.Builder()
                .addServiceUuid(ParcelUuid(UUID.fromString(serviceUuid)))
                .setIncludeDeviceName(false)   // Keep main packet small
                .setIncludeTxPowerLevel(false)
                .build()

            // Scan response packet — contains the local name (= Lifeline identity)
            // Returned when a scanner actively requests more data after seeing the UUID
            val scanResponse = AdvertiseData.Builder()
                .setIncludeDeviceName(true)    // Uses btAdapter.name set above
                .setIncludeTxPowerLevel(false)
                .build()

            advertiseCallback = object : AdvertiseCallback() {
                override fun onStartSuccess(settingsInEffect: AdvertiseSettings) {
                    Log.i(TAG, "BLE advertising started successfully. localName=$localName")
                }

                override fun onStartFailure(errorCode: Int) {
                    val reason = when (errorCode) {
                        ADVERTISE_FAILED_DATA_TOO_LARGE -> "Data too large"
                        ADVERTISE_FAILED_TOO_MANY_ADVERTISERS -> "Too many advertisers"
                        ADVERTISE_FAILED_ALREADY_STARTED -> "Already started"
                        ADVERTISE_FAILED_INTERNAL_ERROR -> "Internal error"
                        ADVERTISE_FAILED_FEATURE_UNSUPPORTED -> "Feature unsupported"
                        else -> "Unknown error code $errorCode"
                    }
                    Log.e(TAG, "BLE advertising failed: $reason")
                }
            }

            advertiser = leAdvertiser
            leAdvertiser.startAdvertising(settings, advertiseData, scanResponse, advertiseCallback)

            // Also start GATT Server to receive incoming messages
            val gattServerCallback = object : BluetoothGattServerCallback() {
                override fun onConnectionStateChange(device: BluetoothDevice, status: Int, newState: Int) {
                    Log.d(TAG, "GATT Server ConnectionStateChange: ${device.address} status=$status newState=$newState")
                }

                override fun onCharacteristicWriteRequest(
                    device: BluetoothDevice,
                    requestId: Int,
                    characteristic: BluetoothGattCharacteristic,
                    preparedWrite: Boolean,
                    responseNeeded: Boolean,
                    offset: Int,
                    value: ByteArray?
                ) {
                    super.onCharacteristicWriteRequest(device, requestId, characteristic, preparedWrite, responseNeeded, offset, value)
                    if (characteristic.uuid.toString().equals(WRITE_CHARACTERISTIC_UUID, ignoreCase = true)) {
                        if (value != null) {
                            val payload = String(value, Charsets.UTF_8)
                            Log.d(TAG, "GATT Server received message: $payload")
                            this@BleAdvertiserModule.sendEvent("onMessageReceived", mapOf("payload" to payload))
                        }
                        if (responseNeeded) {
                            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, offset, value)
                        }
                    } else {
                        if (responseNeeded) {
                            gattServer?.sendResponse(device, requestId, BluetoothGatt.GATT_FAILURE, offset, null)
                        }
                    }
                }
            }

            try {
                gattServer = btManager.openGattServer(context, gattServerCallback)
                
                val service = BluetoothGattService(UUID.fromString(MESSAGING_SERVICE_UUID), BluetoothGattService.SERVICE_TYPE_PRIMARY)
                val characteristic = BluetoothGattCharacteristic(
                    UUID.fromString(WRITE_CHARACTERISTIC_UUID),
                    BluetoothGattCharacteristic.PROPERTY_WRITE,
                    BluetoothGattCharacteristic.PERMISSION_WRITE
                )
                service.addCharacteristic(characteristic)
                
                gattServer?.addService(service)
                Log.i(TAG, "GATT Server started successfully.")
            } catch (e: SecurityException) {
                Log.e(TAG, "Failed to start GATT server: ${e.message}")
            }
        }

        /**
         * Stop advertising and restore the original BT adapter name.
         */
        AsyncFunction("stopAdvertising") {
            val callback = advertiseCallback
            if (callback != null) {
                try {
                    advertiser?.stopAdvertising(callback)
                } catch (e: Exception) {
                    Log.w(TAG, "Error stopping advertiser: ${e.message}")
                }
            }

            // Restore original device name
            originalDeviceName?.let { originalName ->
                try {
                    val context = appContext.reactContext ?: return@let
                    val btManager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                    val btAdapter = btManager?.adapter
                    if (btAdapter != null && btAdapter.isEnabled) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                            btAdapter.setName(originalName)
                        } else {
                            @Suppress("DEPRECATION")
                            btAdapter.name = originalName
                        }
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "Could not restore BT device name: ${e.message}")
                }
            }

            advertiser = null
            advertiseCallback = null
            originalDeviceName = null
            
            try {
                gattServer?.close()
                gattServer = null
            } catch (e: Exception) {
                Log.w(TAG, "Error closing GATT server: ${e.message}")
            }
            
            Log.i(TAG, "BLE advertising and GATT server stopped.")
        }
    }

    companion object {
        private const val TAG = "BleAdvertiser"
        private const val MESSAGING_SERVICE_UUID = "6C696665-6C69-6E65-0002-000000000001"
        private const val WRITE_CHARACTERISTIC_UUID = "6C696665-6C69-6E65-0003-000000000001"
    }
}
