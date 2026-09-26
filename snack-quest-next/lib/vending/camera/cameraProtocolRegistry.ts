/**
 * The camera-side counterpart to `lib/vending/protocol/registry.ts` —
 * the single declarative source of truth for what this codebase
 * actually knows about each camera type, checked against real code
 * the same way that file's own doc comment requires (`'implemented'`
 * only because a real, tested adapter exists behind it).
 */
export interface CameraProtocolRegistryEntry {
  key: string;
  label: string;
  status: 'implemented' | 'planned' | 'requires_documentation';
  transportRequirement: string;
  notes: string;
}

export const CAMERA_PROTOCOL_REGISTRY: readonly CameraProtocolRegistryEntry[] = [
  {
    key: 'mock',
    label: 'Mock (development/simulator)',
    status: 'implemented',
    transportRequirement: 'None — in-memory, used by every test.',
    notes: 'The only fully-capable camera adapter today. See lib/vending/camera/adapters/mockCameraAdapter.ts.',
  },
  {
    key: 'usb',
    label: 'USB (UVC)',
    status: 'planned',
    transportRequirement: 'A USB Video Class-compliant camera and a real device to test capture against.',
    notes:
      'UVC is a public standard — nothing here is blocked on manufacturer documentation. lib/vending/camera/adapters/usbCameraAdapter.ts is an interface-conformant stub; every capability false until a real device exists to validate a capture path against.',
  },
  {
    key: 'ip',
    label: 'IP camera (generic HTTP snapshot)',
    status: 'planned',
    transportRequirement: 'A manufacturer-documented HTTP snapshot endpoint.',
    notes: 'lib/vending/camera/adapters/ipCameraAdapter.ts is an interface-conformant stub. No specific device to build the snapshot-fetch path against yet.',
  },
  {
    key: 'rtsp',
    label: 'RTSP',
    status: 'planned',
    transportRequirement: 'An RTSP-capable network camera.',
    notes: 'RTSP is a public IETF standard. lib/vending/camera/adapters/rtspCameraAdapter.ts is an interface-conformant stub, unblocked by documentation, blocked only on a real device to test a session against.',
  },
  {
    key: 'onvif',
    label: 'ONVIF',
    status: 'planned',
    transportRequirement: 'An ONVIF Profile S (or later) compliant camera.',
    notes: 'lib/vending/camera/adapters/onvifCameraAdapter.ts is an interface-conformant stub, same reasoning as RTSP.',
  },
  {
    key: 'manufacturer_specific',
    label: 'Manufacturer-specific',
    status: 'requires_documentation',
    transportRequirement: 'Unknown — no manufacturer named yet.',
    notes: 'No adapter exists, deliberately — there is no specific manufacturer to name one after (§ CAMERA ADAPTER REGISTRY: "Manufacturer-specific adapters can be added later"). Building a generic placeholder for this slot would be the same speculative scaffolding this codebase avoids for `Machine.manufacturer: \'other\'`.',
  },
];

export function findCameraProtocolRegistryEntry(key: string): CameraProtocolRegistryEntry | undefined {
  return CAMERA_PROTOCOL_REGISTRY.find((entry) => entry.key === key);
}
