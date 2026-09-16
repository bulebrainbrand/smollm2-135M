export interface TensorMeta {
  name: string;
  shape: number[];
  scale: number;
  offset: number; // 生バイト列内でのバイトオフセット
  length: number; // バイト数
}

export interface Manifest {
  encoding: "safe32";
  chunk_size: number; // safe32文字数上限(Code Block 1個あたり)
  spatial_chunk_size: number; // 32^3 spatial chunkに割り当てるsafe32文字数
  blocks_per_spatial_chunk: number;
  num_chunks: number;
  total_encoded_len: number;
  total_raw_bytes: number;
  tensors: TensorMeta[];
}
