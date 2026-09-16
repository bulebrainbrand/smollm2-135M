export interface TensorMeta {
  name: string;
  shape: number[];
  scale: number;
  offset: number; // Byte offset in the raw data.
  length: number; // Byte length.
}

export interface Manifest {
  encoding: "safe32";
  chunk_size: number; // Maximum safe32 characters in one Code Block.
  num_chunks: number;
  total_encoded_len: number;
  total_raw_bytes: number;
  tensors: TensorMeta[];
}
