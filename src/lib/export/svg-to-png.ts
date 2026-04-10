export function downloadSvgAsPng(svgElement: SVGSVGElement, filename: string): void {
  const serializer = new XMLSerializer()
  const svgString = serializer.serializeToString(svgElement)
  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)

  const img = new Image()
  const scale = 2 // retina-quality

  img.onload = () => {
    const canvas = document.createElement('canvas')
    canvas.width = svgElement.width.baseVal.value * scale
    canvas.height = svgElement.height.baseVal.value * scale

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      URL.revokeObjectURL(url)
      return
    }

    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.scale(scale, scale)
    ctx.drawImage(img, 0, 0)
    URL.revokeObjectURL(url)

    canvas.toBlob(blob => {
      if (!blob) return
      const pngUrl = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = pngUrl
      link.download = filename
      link.click()
      URL.revokeObjectURL(pngUrl)
    }, 'image/png')
  }

  img.src = url
}
