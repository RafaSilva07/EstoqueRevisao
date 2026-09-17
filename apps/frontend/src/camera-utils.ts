export const stopMediaStream = (stream: MediaStream | null): void => stream?.getTracks().forEach((track) => track.stop());
