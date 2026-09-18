export interface TensorMeta {
  name: string;
  shape: number[];
  scale: number;
  offset: number; // Byte offset in the raw data.
  length: number; // Byte length.
}
