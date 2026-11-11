// Scansione AR (ARKit) — solo iPhone e iPad. Il modulo nativo è in ios/PiantaArModule.swift.
import { requireOptionalNativeModule } from "expo";

export type ArScanResult = {
  cancelled: boolean;
  zip?: string;          // file://… nella cartella Documenti dell'app
  frames?: number;
  planes?: number;
  walls?: number;
  doors?: number;
  windows?: number;
  lidar?: boolean;
};
type NativeAPI = { isSupported(): boolean; scan(): Promise<ArScanResult> };

const native = requireOptionalNativeModule<NativeAPI>("PiantaAr");
export const arAvailable = (): boolean => { try { return !!native && native.isSupported(); } catch { return false; } };
export async function scanRoom(): Promise<ArScanResult> {
  if (!native) throw new Error("La scansione AR richiede l'app per iPhone o iPad.");
  return native.scan();
}
