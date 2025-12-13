import { ref, computed } from 'vue'

export interface UploadedImage {
  file: File
  dataUrl: string
  imageData: ImageData | null
  width: number
  height: number
}

export function useImageUpload() {
  const uploadedImage = ref<UploadedImage | null>(null)
  const isUploading = ref(false)
  const isDragging = ref(false)
  const error = ref<string | null>(null)

  const hasImage = computed(() => uploadedImage.value !== null)
  const imageDataUrl = computed(() => uploadedImage.value?.dataUrl || null)

  async function handleFile(file: File): Promise<UploadedImage> {
    if (!file.type.startsWith('image/')) {
      throw new Error('Please upload an image file')
    }

    isUploading.value = true
    error.value = null

    try {
      const dataUrl = await readFileAsDataUrl(file)
      const { imageData, width, height } = await loadImageData(dataUrl)

      const uploaded: UploadedImage = {
        file,
        dataUrl,
        imageData,
        width,
        height
      }

      uploadedImage.value = uploaded
      return uploaded
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to upload image'
      throw err
    } finally {
      isUploading.value = false
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault()
    isDragging.value = false

    const file = event.dataTransfer?.files[0]
    if (file) {
      handleFile(file)
    }
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault()
    isDragging.value = true
  }

  function handleDragLeave() {
    isDragging.value = false
  }

  function clearImage() {
    uploadedImage.value = null
    error.value = null
  }

  return {
    uploadedImage,
    isUploading,
    isDragging,
    error,
    hasImage,
    imageDataUrl,
    handleFile,
    handleDrop,
    handleDragOver,
    handleDragLeave,
    clearImage
  }
}

// Helper functions
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

async function loadImageData(dataUrl: string): Promise<{ imageData: ImageData; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      // Normalize to 512x512
      const size = 512
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')

      if (!ctx) {
        reject(new Error('Failed to create canvas context'))
        return
      }

      // Calculate scaling to fit image in canvas
      const scale = Math.min(size / img.width, size / img.height)
      const x = (size - img.width * scale) / 2
      const y = (size - img.height * scale) / 2

      ctx.fillStyle = 'transparent'
      ctx.fillRect(0, 0, size, size)
      ctx.drawImage(img, x, y, img.width * scale, img.height * scale)

      const imageData = ctx.getImageData(0, 0, size, size)
      resolve({ imageData, width: img.width, height: img.height })
    }
    img.onerror = () => reject(new Error('Failed to load image'))
    img.src = dataUrl
  })
}
