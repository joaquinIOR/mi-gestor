import { useEffect, useRef } from 'react';

// Muestra una foto guardada como Blob y libera la memoria al desmontarse.
export default function BlobImage({ blob, alt = '', ...props }) {
  const ref = useRef(null);
  useEffect(() => {
    const url = URL.createObjectURL(blob);
    ref.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return <img ref={ref} alt={alt} decoding="async" {...props} />;
}
