// Ambient declarations for third-party modules without bundled TypeScript types.

declare module "ffprobe-static" {
  const ffprobe: { path: string };
  export default ffprobe;
}
