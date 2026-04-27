# Orbfolio

Orbfolio is a static Vercel-ready photo globe app that lets a user:

- sign up and log in with Firebase Authentication
- upload images into Firebase Storage
- sync image metadata through Firestore so the same globe appears on other devices
- explore those images on an invisible interactive 3D sphere
- click any image to open a larger preview
- generate a public share link so friends can rotate the same globe

## Files

- `index.html` - app shell, auth screen, studio, share view, and modals
- `styles.css` - full visual system and responsive layout
- `app.js` - Three.js globe logic plus Firebase auth, upload, sync, and share flow
- `firebase-config.js` - your Firebase web app config goes here

## What You Need From Firebase

Create a Firebase project in the Firebase console, then enable these products:

1. Authentication
   Use the `Email/Password` provider.
2. Firestore Database
   Start in production mode or test mode, then apply the rules below.
3. Storage
   Create the default bucket, then apply the storage rules below.
4. Web App registration
   Register a web app inside the Firebase project so Firebase gives you the client config object.

## Where To Put The Firebase Credentials

Open [firebase-config.js](/C:/Users/PC/Documents/New%20project/firebase-config.js) and replace the placeholder values with the config from your Firebase web app.

Change:

```js
enabled: false
```

to:

```js
enabled: true
```

Firebase will give you a config object that looks like this:

```js
window.GLOBE_GALLERY_CONFIG = {
  appName: "Orbfolio",
  firebase: {
    enabled: true,
    config: {
      apiKey: "AIza...",
      authDomain: "your-project.firebaseapp.com",
      projectId: "your-project",
      storageBucket: "your-project.appspot.com",
      messagingSenderId: "1234567890",
      appId: "1:1234567890:web:abcdef123456"
    }
  },
  gallery: {
    maxImages: 96,
    maxUploadSizeMb: 12
  }
};
```

The Firebase web config is meant for client apps, so it is okay for it to be in a frontend project.

## Firestore Rules

Paste these into the Firestore rules editor:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;

      match /images/{imageId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }

    match /shared_globes/{shareId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.ownerUid == request.auth.uid;
      allow update, delete: if request.auth != null
        && resource.data.ownerUid == request.auth.uid;
    }
  }
}
```

## Storage Rules

Paste these into the Firebase Storage rules editor:

```txt
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /users/{userId}/{allPaths=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}
```

## How Sharing Works

- A user stays private by default.
- Once they click `Share Globe`, the app creates a public Firestore document in `shared_globes/{shareId}`.
- That share document stores lightweight image metadata plus the Firebase Storage download URLs.
- Friends can open `?share=that-share-id` and interact with the globe without logging in.

## Deploying With GitHub And Vercel

1. Put your real Firebase config into `firebase-config.js`.
2. Push this folder to a GitHub repository.
3. Import that repository into Vercel.
4. Deploy it as a static site.

No build step is required because the app uses plain HTML, CSS, and browser modules.

## Important Notes

- The globe is intentionally invisible. Only the images render on the sphere.
- Blank spaces are expected when the globe does not have enough images yet.
- Shared viewers can rotate and click images, but only the owner can upload or delete them.
- The current setup uses direct browser-side Firebase access, which keeps deployment simple for Vercel.
