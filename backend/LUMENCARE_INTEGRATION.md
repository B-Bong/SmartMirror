# Lumencare → Smart Mirror: Face Registration Integration

When a caregiver registers a new dependent in Lumencare, call this endpoint
**immediately after** the Supabase `elderlies` row is created.  
This triggers the backend to extract the 128-d face embedding from the photo
and store it on the row, enabling automatic Smart Mirror recognition.

---

## Endpoint

```
POST http://<SMART_MIRROR_HOST>:8000/api/auth/register-face
Content-Type: multipart/form-data
```

> Replace `<SMART_MIRROR_HOST>` with the local network IP of the Smart Mirror
> machine (e.g. `192.168.1.42`). Port `8000` is the default.

---

## Request Fields (multipart/form-data)

| Field        | Type   | Required | Description                                      |
|--------------|--------|----------|--------------------------------------------------|
| `elderly_id` | string | ✅       | UUID of the `elderlies` row just created         |
| `file`       | file   | ✅       | Photo of the dependent's face (JPEG/PNG, ≤ 10 MB) |

---

## Response

### ✅ Success `200`
```json
{
  "success": true,
  "message": "Face registered successfully"
}
```

### ❌ No face detected `400`
```json
{
  "success": false,
  "message": "No face detected in the photo. Please use a clear, well-lit photo showing the person's face."
}
```

### ❌ Multiple faces `400`
```json
{
  "success": false,
  "message": "Multiple faces detected (2). Please use a photo with only one person."
}
```

### ❌ Bad elderly_id `400`
```json
{
  "success": false,
  "message": "No matching record found. Please check the elderly_id."
}
```

---

## Code Examples

### React Native / Expo (using `fetch`)

Call this right after your existing Supabase `insert` for the new dependent.

```typescript
import * as FileSystem from 'expo-file-system'
import * as ImagePicker from 'expo-image-picker'

const SMART_MIRROR_URL = 'http://192.168.1.42:8000' // ← update to your mirror's IP

/**
 * Register a dependent's face with the Smart Mirror backend.
 * @param elderlyId  - UUID returned from Supabase after inserting the elderlies row
 * @param photoUri   - local URI of the photo picked by the caregiver
 */
export async function registerFaceWithMirror(
  elderlyId: string,
  photoUri: string
): Promise<{ success: boolean; message?: string }> {
  const formData = new FormData()

  formData.append('elderly_id', elderlyId)
  formData.append('file', {
    uri: photoUri,
    name: 'face.jpg',
    type: 'image/jpeg',
  } as any)

  try {
    const response = await fetch(`${SMART_MIRROR_URL}/api/auth/register-face`, {
      method: 'POST',
      body: formData,
      // Do NOT set Content-Type manually — fetch sets it with the correct boundary
    })

    const data = await response.json()

    if (data.success) {
      console.log('✅ Face registered with Smart Mirror')
    } else {
      console.warn('⚠️ Face registration failed:', data.message)
    }

    return data
  } catch (error) {
    // Network error — mirror may be offline. Don't block the user flow.
    console.error('Smart Mirror unreachable during face registration:', error)
    return { success: false, message: 'Smart Mirror offline' }
  }
}
```

### Where to call it (pseudocode)

```typescript
// Inside your RegisterDependent screen / handler:

// 1. Create the row in Supabase first
const { data: newDependent, error } = await supabase
  .from('elderlies')
  .insert({ first_name, last_name, caregiver_id, ... })
  .select()
  .single()

if (error) throw error

// 2. NOW call the Smart Mirror backend to register the face
if (photoUri) {
  const result = await registerFaceWithMirror(newDependent.id, photoUri)

  if (!result.success) {
    // Show a non-blocking warning — the user can still use the app
    showToast(`Face registration: ${result.message ?? 'failed'}`)
  }
}
```

---

## Important Notes

| # | Note |
|---|------|
| 1 | **Non-blocking:** If the Smart Mirror is offline, catch the error and warn the user without blocking dependent creation. |
| 2 | **One face only:** The photo must show exactly one person's face. Group photos will be rejected. |
| 3 | **Photo quality:** Use a clear, well-lit, front-facing photo. Sunglasses, heavy shadows, or blurry photos will fail face detection. |
| 4 | **Re-registration:** Calling the endpoint again for the same `elderly_id` overwrites the previous embedding — useful if the caregiver wants to update the photo. |
| 5 | **Local network only:** The Smart Mirror backend is not exposed to the internet. Both devices must be on the same Wi-Fi network. |

---

## Quick curl test

```bash
curl -X POST http://localhost:8000/api/auth/register-face \
  -F "elderly_id=04b09682-2e92-4678-879f-11d088a24ad2" \
  -F "file=@/path/to/photo.jpg"
```
