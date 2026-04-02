import os
import sys
from dotenv import load_dotenv
from deepface import DeepFace
from supabase import create_client, Client

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def register_user(image_path: str, elderly_id: str):
    """
    Extracts the face embedding from the provided image and updates the
    elderly record in Supabase with the vector.
    """
    if not os.path.exists(image_path):
        print(f"Error: Could not find image at {image_path}")
        sys.exit(1)
        
    print(f"Analyzing face in {image_path}...")
    
    try:
        # Generate the embedding using the exact same configuration as the main app
        results = DeepFace.represent(
            img_path=image_path,
            model_name="Facenet",
            detector_backend="mtcnn",
            enforce_detection=True
        )
        
        if len(results) > 1:
            print("Warning: Multiple faces detected. Using the most prominent one.")
            
        embedding = results[0]["embedding"]
        print(f"Successfully generated 128-d face embedding!")
        
        # Update the Supabase record
        print(f"Uploading embedding to Supabase for elderly_id: {elderly_id}...")
        
        response = supabase.table("elderlies").update({
            "face_embedding": embedding
        }).eq("id", elderly_id).execute()
        
        if response.data:
            print("\n✅ Success! The user's face is now registered in the database.")
            print("The Smart Mirror will now instantly recognize this face.")
        else:
            print("\n❌ Failed to update. Make sure the elderly_id exists in your database.")
            
    except ValueError as e:
        print(f"Error: {e}")
        print("Tip: Ensure the photo is clear and contains exactly one visible face.")
    except Exception as e:
        print(f"An unexpected error occurred: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python register_user.py <path_to_image> <elderly_id>")
        print("Example: python register_user.py my_face.jpg 1b9418fc-a707-4da1-8a44-c30c11ac1ee8")
        sys.exit(1)
        
    img_path = sys.argv[1]
    e_id = sys.argv[2]
    
    register_user(img_path, e_id)
