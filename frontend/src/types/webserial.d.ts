// Minimal Web Serial typings (Chrome / Edge). https://wicg.github.io/serial/
interface SerialPort {
  readonly readable: ReadableStream<Uint8Array> | null;
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
}

interface Serial extends EventTarget {
  requestPort(options?: { filters?: { usbVendorId?: number; usbProductId?: number }[] }): Promise<SerialPort>;
}

interface Navigator {
  readonly serial?: Serial;
}
