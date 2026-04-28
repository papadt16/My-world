import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  deleteDoc,
  updateDoc,
  increment,
  arrayUnion, 
  arrayRemove
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const DEFAULT_CONFIG = {
  appName: "Orbfolio",
  firebase: {
    enabled: false,
    config: null
  },
  cloudinary: {
    enabled: false,
    cloudName: "",
    uploadPreset: "",
    folder: "orbfolio"
  },
  gallery: {
    maxImages: 96,
    maxUploadSizeMb: 12
  }
};

const APP_CONFIG = mergeConfig(DEFAULT_CONFIG, window.GLOBE_GALLERY_CONFIG || {});
const SHARE_PARAM = new URLSearchParams(window.location.search).get("share");
const HAS_FIREBASE_CONFIG = isFirebaseConfigured(APP_CONFIG.firebase);
const HAS_CLOUDINARY_CONFIG = isCloudinaryConfigured(APP_CONFIG.cloudinary);

const refs = {};

const state = {
  authMode: "login",
  auth: null,
  db: null,
  user: null,
  profile: null,
  images: [],
  viewer: null,
  sharedViewer: null,
  sharedDoc: null,
  currentPreview: null,
  shareSyncTimer: null,
  toastTimer: null,
  uploadBusy: false,
  unsubscribeImages: null,
  unsubscribeProfile: null,
  unsubscribeShared: null
};

// --- THE THEME ENGINE ---
const ORBFOLIO_THEMES = {
  "Deep Orbit": {
    "--bg-0": "#06121f",
    "--bg-1": "#0b1c2d",
    "--bg-2": "#10263a",
    "--champagne": "#d8b98d",
    "--seafoam": "#7fd1c5",
    "--rose": "#f2a995",
    "--text": "#f4efe7"
  },
  "Midnight Neon": {
    "--bg-0": "#090514",
    "--bg-1": "#13092b",
    "--bg-2": "#1f0f45",
    "--champagne": "#ff007f", // Neon Pink
    "--seafoam": "#00f3ff",   // Cyan
    "--rose": "#b500ff",      // Purple
    "--text": "#e0d6ff"
  },
  "Galactic Rose": {
    "--bg-0": "#1a0b12",
    "--bg-1": "#2d131f",
    "--bg-2": "#401b2c",
    "--champagne": "#f9c8d6", // Light Rose Gold
    "--seafoam": "#ffb38a",   // Peach
    "--rose": "#ff4d6d",      // Vibrant Rose
    "--text": "#fce4ec"
  }
};

function applyTheme(themeName) {
  // Default to Deep Orbit if something goes wrong
  const theme = ORBFOLIO_THEMES[themeName] || ORBFOLIO_THEMES["Deep Orbit"];
  const root = document.documentElement;
  
  // Inject the specific colors into the CSS variables
  Object.entries(theme).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
document.addEventListener("DOMContentLoaded", boot);

async function boot() {
  cacheDom();
  bindUI();

  // 1. Hide everything initially so we don't get a flash of the login screen on refresh
  refs.authScreen.hidden = true;
  refs.appShell.hidden = true;
  refs.shareShell.hidden = true;

  if (!HAS_FIREBASE_CONFIG) {
    renderMissingConfig();
    if (SHARE_PARAM) showShareUnavailable();
    return;
  }

  initFirebase();

  // 2. Let Firebase figure out the user state first, THEN route them!
  onAuthStateChanged(state.auth, async (user) => {
    await handleAuthState(user);
  });
}

function cacheDom() {
  refs.setupBanner = document.getElementById("setup-banner");
  refs.authScreen = document.getElementById("auth-screen");
  refs.authTitle = document.getElementById("auth-title");
  refs.authSubtitle = document.getElementById("auth-subtitle");
  refs.nameField = document.getElementById("name-field");
  refs.displayNameInput = document.getElementById("display-name-input");
  refs.emailInput = document.getElementById("email-input");
  refs.passwordInput = document.getElementById("password-input");
  refs.authError = document.getElementById("auth-error");
  refs.authForm = document.getElementById("auth-form");
  refs.authSubmitBtn = document.getElementById("auth-submit-btn");
  refs.authToggleBtn = document.getElementById("auth-toggle-btn");

  refs.appShell = document.getElementById("app-shell");
  refs.shareShell = document.getElementById("share-shell");
  refs.shareBtn = document.getElementById("share-btn");
  refs.shareCopy = document.getElementById("share-copy");
  refs.addImageBtn = document.getElementById("add-image-btn");
  refs.logoutBtn = document.getElementById("logout-btn");
  refs.welcomeHeading = document.getElementById("welcome-heading");
  refs.welcomeCopy = document.getElementById("welcome-copy");
  refs.imageCount = document.getElementById("image-count");
  refs.shareStatus = document.getElementById("share-status");
  refs.storageChip = document.getElementById("storage-chip");
  refs.thumbnailList = document.getElementById("thumbnail-list");
  refs.sceneTitle = document.getElementById("scene-title");
  refs.sceneCaption = document.getElementById("scene-caption");
  refs.globeStage = document.getElementById("globe-stage");
  refs.emptyState = document.getElementById("empty-state");

  refs.sharedOwnerName = document.getElementById("shared-owner-name");
  refs.sharedCaption = document.getElementById("shared-caption");
  refs.sharedGlobeStage = document.getElementById("shared-globe-stage");
  refs.shareEmptyState = document.getElementById("share-empty-state");
  refs.openOwnGlobeBtn = document.getElementById("open-own-globe-btn");

  refs.uploadModal = document.getElementById("upload-modal");
  refs.closeUploadModalBtn = document.getElementById("close-upload-modal-btn");
  refs.uploadForm = document.getElementById("upload-form");
  refs.imageInput = document.getElementById("image-input");
  refs.uploadSelection = document.getElementById("upload-selection");
  refs.uploadError = document.getElementById("upload-error");
  refs.uploadSubmitBtn = document.getElementById("upload-submit-btn");

  refs.previewModal = document.getElementById("preview-modal");
  refs.closePreviewModalBtn = document.getElementById("close-preview-modal-btn");
  refs.previewImage = document.getElementById("preview-image");
  refs.previewVideo = document.getElementById("preview-video");
  refs.previewTitle = document.getElementById("preview-title");
  refs.previewMeta = document.getElementById("preview-meta");
  refs.deleteImageBtn = document.getElementById("delete-image-btn");
  refs.downloadBtn = document.getElementById("download-btn"); 
  refs.toggleSidebarBtn = document.getElementById("toggle-sidebar-btn");
  refs.expandGlobeBtn = document.getElementById("expand-globe-btn");
  refs.dashboardPanel = document.querySelector(".dashboard-panel");
  refs.viewerFrame = document.querySelector(".viewer-frame");
  refs.imageDescription = document.getElementById("image-description");
  refs.saveDescriptionBtn = document.getElementById("save-description-btn");
  refs.togglePasswordBtn = document.getElementById("toggle-password-btn");
  refs.themeSelector = document.getElementById("theme-selector"); 
  
  refs.totalLikes = document.getElementById("total-likes");
  refs.editDescriptionBtn = document.getElementById("edit-description-btn");
  refs.visitorDescription = document.getElementById("visitor-description");
  refs.likeBtn = document.getElementById("like-btn");
  refs.likeCount = document.getElementById("like-count");
  refs.previewEyebrow = document.getElementById("preview-eyebrow");
  refs.sidebarBackdrop = document.getElementById("sidebar-backdrop");
  refs.closeSidebarBtn = document.getElementById("close-sidebar-btn");
  
  refs.toast = document.getElementById("toast");
  refs.authPromptModal = document.getElementById("auth-prompt-modal");
  refs.closeAuthPromptBtn = document.getElementById("close-auth-prompt-btn");
  refs.goToAuthBtn = document.getElementById("go-to-auth-btn");
}

function bindUI() {
  refs.authForm.addEventListener("submit", handleAuthSubmit);
  refs.authToggleBtn.addEventListener("click", toggleAuthMode);
  refs.shareBtn.addEventListener("click", handleShareClick);
  refs.addImageBtn.addEventListener("click", openUploadModal);
  refs.logoutBtn.addEventListener("click", handleLogout);
  refs.openOwnGlobeBtn.addEventListener("click", openStudioHome);

  refs.closeUploadModalBtn.addEventListener("click", closeUploadModal);
  refs.uploadForm.addEventListener("submit", handleUploadSubmit);
  refs.imageInput.addEventListener("change", updateUploadSelection);

  refs.editDescriptionBtn.addEventListener("click", enableDescriptionEdit);
  refs.likeBtn.addEventListener("click", handleLikeClick);
  
  refs.closePreviewModalBtn.addEventListener("click", closePreviewModal);
  refs.deleteImageBtn.addEventListener("click", handleDeleteCurrentImage);
  refs.saveDescriptionBtn.addEventListener("click", saveImageDescription);
  
  refs.togglePasswordBtn.addEventListener("click", () => {
    const isPassword = refs.passwordInput.type === "password";
    refs.passwordInput.type = isPassword ? "text" : "password";
    refs.togglePasswordBtn.style.opacity = isPassword ? "0.5" : "1"; // Visual feedback
  });
  
  // Auto-resize the description textarea as the user types
  refs.imageDescription.addEventListener("input", function() {
    this.style.height = "auto";
    this.style.height = (this.scrollHeight) + "px";
  });

  refs.themeSelector.addEventListener("change", async (event) => {
    if (!state.user) return;
    const newTheme = event.target.value;
    
    // Apply it visually immediately
    applyTheme(newTheme);
    
    // Save to Firestore profile
    try {
      await updateDoc(doc(state.db, "users", state.user.uid), {
        theme: newTheme
      });
      showToast(`Atmosphere changed to ${newTheme} ✨`);
    } catch (error) {
      showToast("Failed to save theme.", true);
    }
  });

  refs.closeAuthPromptBtn.addEventListener("click", () => { 
    refs.authPromptModal.hidden = true; 
  });
  
  refs.goToAuthBtn.addEventListener("click", () => {
    refs.authPromptModal.hidden = true;
    showAuth(); // Shows login without dropping the share link URL!
  });
  
  // Mobile Action Buttons
const toggleMenu = () => {
    const isOpen = refs.dashboardPanel.classList.toggle("is-open");
    refs.sidebarBackdrop.hidden = !isOpen;
  };

  if (refs.toggleSidebarBtn) refs.toggleSidebarBtn.addEventListener("click", toggleMenu);
  if (refs.closeSidebarBtn) refs.closeSidebarBtn.addEventListener("click", toggleMenu);
  if (refs.sidebarBackdrop) refs.sidebarBackdrop.addEventListener("click", toggleMenu);

  if (refs.expandGlobeBtn) {
    refs.expandGlobeBtn.addEventListener("click", () => {
      refs.viewerFrame.classList.toggle("is-expanded");
      refs.expandGlobeBtn.textContent = refs.viewerFrame.classList.contains("is-expanded") ? "Minimize" : "Expand";
      
      // Critical: Tell Three.js the container size changed
      if (state.viewer) state.viewer.resize();
    });
  }

  // Modal Backdrop Clicks
  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (event) => {
      const target = event.currentTarget;
      const closeType = target.getAttribute("data-close");

      if (closeType === "upload") {
        closeUploadModal();
      } else if (closeType === "preview") {
        closePreviewModal();
      } else if (closeType === "auth-prompt") {
        refs.authPromptModal.hidden = true; // <-- Add this!
      }
    });
  });

  // Keyboard Shortcuts
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closePreviewModal();
      closeUploadModal();
    }
  });
}

function initFirebase() {
  const app = initializeApp(APP_CONFIG.firebase.config);
  state.auth = getAuth(app);
  state.db = getFirestore(app);
}

async function handleAuthState(user) {
  clearUserSubscriptions();
  state.user = user || null;

  // 3. 14-Hour Session Timeout Logic
  const loginTime = localStorage.getItem("orbfolio_login_time");
  const fourteenHours = 14 * 60 * 60 * 1000;
  if (user && loginTime && (Date.now() - parseInt(loginTime)) > fourteenHours) {
    await handleLogout();
    return; // Stops here, auth state will trigger again as null
  }

  // 4. Set up user data if logged in
  if (user) {
    await ensureUserProfile(user);
    subscribeToUserData(user.uid);
  } else {
    state.profile = null;
    state.images = [];
    if (state.viewer) state.viewer.setImages([]);
    updateStudio();
  }

  // 5. THE MASTER ROUTER
  if (SHARE_PARAM) {
    // If they have a share link, ALWAYS show the shared globe, whether logged in or not
    openSharedGlobe(SHARE_PARAM);
  } else if (user) {
    // Logged in, no share link -> Studio
    showStudio();
  } else {
    // Logged out, no share link -> Login
    showAuth();
  }
}

function clearUserSubscriptions() {
  if (typeof state.unsubscribeImages === "function") {
    state.unsubscribeImages();
    state.unsubscribeImages = null;
  }

  if (typeof state.unsubscribeProfile === "function") {
    state.unsubscribeProfile();
    state.unsubscribeProfile = null;
  }
}

function clearSharedSubscription() {
  if (typeof state.unsubscribeShared === "function") {
    state.unsubscribeShared();
    state.unsubscribeShared = null;
  }
}

async function ensureUserProfile(user) {
  const profileRef = doc(state.db, "users", user.uid);
  const snapshot = await getDoc(profileRef);
  const fallbackName = user.displayName || user.email?.split("@")[0] || "Orbfolio User";

  if (!snapshot.exists()) {
    const newProfile = {
      displayName: fallbackName,
      email: user.email || "",
      shareEnabled: false,
      shareId: createShareId(fallbackName, user.uid),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      theme: "Deep Orbit"
    };

    await setDoc(profileRef, newProfile, { merge: true });
    state.profile = newProfile;
    return;
  }

  const currentProfile = snapshot.data() || {};
  const patch = {};

  if (!currentProfile.displayName) {
    patch.displayName = fallbackName;
  }

  if (!currentProfile.email && user.email) {
    patch.email = user.email;
  }

  if (typeof currentProfile.shareEnabled !== "boolean") {
    patch.shareEnabled = false;
  }

  if (!currentProfile.shareId) {
    patch.shareId = createShareId(currentProfile.displayName || fallbackName, user.uid);
  }

  if (Object.keys(patch).length) {
    patch.updatedAt = serverTimestamp();
    await setDoc(profileRef, patch, { merge: true });
  }

  state.profile = {
    ...currentProfile,
    ...patch
  };
}

function subscribeToUserData(uid) {
  const profileRef = doc(state.db, "users", uid);
  const imagesQuery = query(collection(state.db, "users", uid, "images"), orderBy("createdAtMs", "desc"));

  state.unsubscribeProfile = onSnapshot(
    profileRef,
      (snapshot) => {
      if (!snapshot.exists()) return;
      state.profile = snapshot.data() || {};
      
      // Load the saved theme and update the dropdown UI
      const savedTheme = state.profile.theme || "Deep Orbit";
      applyTheme(savedTheme);
      if (refs.themeSelector) refs.themeSelector.value = savedTheme;
      
      updateStudio();
    },
    (error) => {
      showToast(formatUploadError(error), true);
    }
  );

  state.unsubscribeImages = onSnapshot(
    imagesQuery,
    (snapshot) => {
      state.images = snapshot.docs.map((item) => ({
        id: item.id,
        ...item.data()
      }));

      updateStudio();

      if (state.profile?.shareEnabled) {
        scheduleShareSync();
      }
    },
    (error) => {
      showToast(formatUploadError(error), true);
    }
  );
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  if (!HAS_FIREBASE_CONFIG) {
    return;
  }

  hideAuthError();

  const email = refs.emailInput.value.trim();
  const password = refs.passwordInput.value.trim();
  const displayName = refs.displayNameInput.value.trim();

  if (!email || !password) {
    showAuthError("Enter both your email address and password.");
    return;
  }

  if (state.authMode === "signup" && !displayName) {
    showAuthError("Add a display name so your shared globe has a signature.");
    return;
  }

  refs.authSubmitBtn.disabled = true;
  refs.authSubmitBtn.textContent = state.authMode === "login" ? "Signing in..." : "Creating account...";

  try {
    if (state.authMode === "login") {
      await signInWithEmailAndPassword(state.auth, email, password);
    } else {
      const credential = await createUserWithEmailAndPassword(state.auth, email, password);

      await updateProfile(credential.user, {
        displayName
      });

      await setDoc(doc(state.db, "users", credential.user.uid), {
        displayName,
        email,
        shareEnabled: false,
        shareId: createShareId(displayName, credential.user.uid),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }, { merge: true });
    }
    
    refs.authForm.reset();
    localStorage.setItem("orbfolio_login_time", Date.now().toString());
  } catch (error) {
    showAuthError(formatFirebaseError(error));
  } finally {
    refs.authSubmitBtn.disabled = false;
    renderAuthMode();
  }
}

function toggleAuthMode() {
  state.authMode = state.authMode === "login" ? "signup" : "login";
  hideAuthError();
  renderAuthMode();
}

function renderAuthMode() {
  const isLogin = state.authMode === "login";

  refs.authTitle.textContent = isLogin ? "Welcome back" : "Create your globe";
  refs.authSubtitle.textContent = isLogin
    ? "Sign in to continue building your floating photo sphere."
    : "Create an account so your images sync across devices and shared links stay attached to you.";
  refs.authSubmitBtn.textContent = isLogin ? "Log In" : "Create Account";
  refs.authToggleBtn.textContent = isLogin
    ? "Need an account? Create one"
    : "Already have an account? Log in";
  refs.nameField.hidden = isLogin;
  refs.passwordInput.autocomplete = isLogin ? "current-password" : "new-password";
}

function showAuth() {
  refs.authScreen.hidden = false;
  refs.appShell.hidden = true;
  refs.shareShell.hidden = true;
}

function showStudio() {
  refs.authScreen.hidden = true;
  refs.appShell.hidden = false;
  refs.shareShell.hidden = true;
  ensureStudioViewer();
  updateStudio();
}

function showShareShell() {
  refs.authScreen.hidden = true;
  refs.appShell.hidden = true;
  refs.shareShell.hidden = false;
  ensureSharedViewer();
}

function renderMissingConfig() {
  refs.setupBanner.hidden = false;
  refs.storageChip.textContent = "Firebase required";
  refs.authSubmitBtn.disabled = true;
  refs.authSubmitBtn.textContent = "Firebase Setup Required";
  showAuthError("Add your Firebase web app config in firebase-config.js, then switch enabled to true.");
}

function showShareUnavailable() {
  showShareShell();
  refs.sharedOwnerName.textContent = "Shared globe unavailable";
  refs.sharedCaption.textContent = "This local copy needs Firebase credentials before public share links can load.";
  refs.shareEmptyState.hidden = false;
}

async function openSharedGlobe(shareId) {
  clearSharedSubscription();
  showShareShell();
  refs.sharedOwnerName.textContent = "Loading globe...";
  refs.sharedCaption.textContent = "Fetching the shared orbit now.";
  refs.shareEmptyState.hidden = true;

  const sharedRef = doc(state.db, "shared_globes", shareId);

  state.unsubscribeShared = onSnapshot(
    sharedRef,
    (snapshot) => {
      if (!snapshot.exists()) {
        state.sharedDoc = null;
        refs.sharedOwnerName.textContent = "Globe not found";
        refs.sharedCaption.textContent = "This link is missing, expired, or has not been shared yet.";
        refs.shareEmptyState.hidden = false;

        if (state.sharedViewer) {
          state.sharedViewer.setImages([]);
        }

        return;
      }

      state.sharedDoc = snapshot.data() || {};
      const ownerName = state.sharedDoc.ownerName || "Shared Globe";
      const sharedImages = Array.isArray(state.sharedDoc.images) ? state.sharedDoc.images : [];
      applyTheme(state.sharedDoc.theme || "Deep Orbit");

      refs.sharedOwnerName.textContent = `${ownerName}'s World`;
      refs.sharedCaption.textContent = sharedImages.length
        ? `${sharedImages.length} images floating on an invisible sphere.`
        : "This globe is shared, but no images have been added yet.";
      refs.shareEmptyState.hidden = sharedImages.length > 0;

      ensureSharedViewer();
      state.sharedViewer.setImages(sharedImages);
    },
    (error) => {
      refs.sharedOwnerName.textContent = "Globe unavailable";
      refs.sharedCaption.textContent = formatUploadError(error);
      refs.shareEmptyState.hidden = false;
    }
  );
}

function updateStudio() {
  const displayName = state.profile?.displayName || state.user?.displayName || "there";
  const count = state.images.length;
  const shareEnabled = !!state.profile?.shareEnabled;

  refs.welcomeHeading.textContent = `Hello, ${displayName}`;
  refs.imageCount.textContent = String(count);
  
  const totalLikesCount = state.images.reduce((sum, img) => {
    const likes = img.likedBy ? img.likedBy.length : (img.likes || 0);
    return sum + likes;
  }, 0);
  if (refs.totalLikes) refs.totalLikes.textContent = String(totalLikesCount);
  
  refs.shareStatus.textContent = shareEnabled ? "Live" : "Private";
  refs.storageChip.textContent = HAS_CLOUDINARY_CONFIG ? "Cloudinary active" : "Cloudinary required";
  refs.shareCopy.textContent = shareEnabled
    ? "Public link stays updated whenever you add more images."
    : "Generate a public interactive link for friends.";
  refs.addImageBtn.disabled = !HAS_CLOUDINARY_CONFIG;

  if (!count) {
    refs.welcomeCopy.textContent = "Add images and they will settle on the sphere.";
    refs.sceneTitle.textContent = "Floating memories on an invisible orbit.";
    refs.emptyState.hidden = false;
  } else {
    refs.welcomeCopy.textContent = count === 1
      ? "Your first image is in orbit. Add more and the globe will grow around it."
      : `${count} images are already floating on your invisible globe. Add more to tighten the orbit.`;
    refs.sceneTitle.textContent = count === 1
      ? "One image already suspended on the sphere."
      : `${count} images wrapped around your sphere.`;
    refs.emptyState.hidden = true;
  }

  renderThumbnailList();
  ensureStudioViewer();

  if (state.viewer) {
    state.viewer.setImages(state.images);
  }
}

function renderThumbnailList() {
  refs.thumbnailList.replaceChildren();

  if (!state.images.length) {
    const empty = document.createElement("div");
    empty.className = "thumbnail-empty";
    empty.textContent = "Your recent uploads will appear here once you add them.";
    refs.thumbnailList.appendChild(empty);
    return;
  }

  state.images.slice(0, 2).forEach((image) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "thumbnail-item";
    item.addEventListener("click", () => openPreview(image, true));

    const thumb = document.createElement("img");
    thumb.className = "thumbnail-image";
    thumb.alt = image.name || "Uploaded image";
    thumb.src = image.downloadURL;

    const copy = document.createElement("div");
    copy.className = "thumbnail-copy";

    const title = document.createElement("strong");
    title.textContent = image.name || "Untitled image";

    const meta = document.createElement("span");
    meta.textContent = formatPreviewMeta(image);

    copy.append(title, meta);
    item.append(thumb, copy);
    refs.thumbnailList.appendChild(item);
  });
}

function ensureStudioViewer() {
  if (!refs.globeStage || refs.appShell.hidden) {
    return;
  }

  if (!state.viewer) {
    state.viewer = new GlobeViewer(refs.globeStage, {
      onSelect: (image) => openPreview(image, true)
    });
  } else {
    state.viewer.resize();
  }
}

function ensureSharedViewer() {
  if (!refs.sharedGlobeStage || refs.shareShell.hidden) {
    return;
  }

  if (!state.sharedViewer) {
    state.sharedViewer = new GlobeViewer(refs.sharedGlobeStage, {
      onSelect: (image) => openPreview(image, false)
    });
  } else {
    state.sharedViewer.resize();
  }
}

async function handleLogout() {
  if (!state.auth) {
    return;
  }
  await signOut(state.auth);
  applyTheme("Deep Orbit");
}

function openUploadModal() {
  if (!state.user) {
    showToast("Sign in first so the upload knows which globe to target.", true);
    return;
  }

  if (!HAS_CLOUDINARY_CONFIG) {
    showToast("Add your Cloudinary cloud name and unsigned upload preset in firebase-config.js first.", true);
    return;
  }

  refs.uploadModal.hidden = false;
  hideUploadError();
}

function closeUploadModal() {
  refs.uploadModal.hidden = true;
  refs.uploadForm.reset();
  refs.uploadSelection.textContent = "No files selected yet.";
  hideUploadError();
}

function updateUploadSelection() {
  const files = Array.from(refs.imageInput.files || []);

  if (!files.length) {
    refs.uploadSelection.textContent = "No files selected yet.";
    return;
  }

  const names = files.slice(0, 3).map((file) => cleanFileLabel(file.name));
  const extra = files.length > 3 ? ` and ${files.length - 3} more` : "";
  refs.uploadSelection.textContent = `${files.length} selected: ${names.join(", ")}${extra}`;
}

async function handleUploadSubmit(event) {
  event.preventDefault();

  if (!state.user || state.uploadBusy) {
    return;
  }

  hideUploadError();

  const files = Array.from(refs.imageInput.files || []);

  if (!files.length) {
    showUploadError("Choose at least one image before you upload.");
    return;
  }

  if (state.images.length + files.length > APP_CONFIG.gallery.maxImages) {
    showUploadError(`This globe allows up to ${APP_CONFIG.gallery.maxImages} images.`);
    return;
  }

  state.uploadBusy = true;
  refs.uploadSubmitBtn.disabled = true;
  refs.uploadSubmitBtn.textContent = "Uploading...";

  let successCount = 0;
  const failures = [];

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];

     if (!file.type.startsWith("image/") && !file.type.startsWith("video/")) {
        failures.push(`${file.name}: must be an image or video.`);
        continue;
      }

      if (file.size > APP_CONFIG.gallery.maxUploadSizeMb * 1024 * 1024) {
        failures.push(`${file.name}: larger than ${APP_CONFIG.gallery.maxUploadSizeMb}MB.`);
        continue;
      }

      refs.uploadSelection.textContent = `Uploading ${index + 1} of ${files.length}: ${cleanFileLabel(file.name)}`;

      try {
        const imageId = createId();
        const metrics = await readMediaMetrics(file);
        const fileLabel = cleanFileLabel(file.name);
        const createdAtMs = Date.now() + index;
        const uploadResult = await uploadImageToCloudinary(file, state.user.uid, imageId);

        await setDoc(doc(state.db, "users", state.user.uid, "images", imageId), {
          id: imageId,
          name: fileLabel,
          downloadURL: uploadResult.secureUrl,
          publicId: uploadResult.publicId,
          assetFolder: uploadResult.folder || APP_CONFIG.cloudinary.folder || "",
          width: metrics.width,
          height: metrics.height,
          contentType: file.type || "image/jpeg",
          size: file.size,
          createdAt: serverTimestamp(),
          createdAtMs,
          description: "",
        });

        successCount += 1;
      } catch (error) {
        failures.push(`${file.name}: ${formatUploadError(error)}`);
      }
    }

    if (successCount && state.profile?.shareEnabled) {
      await syncShareDocument(true);
    }

    if (successCount) {
      closeUploadModal();
      showToast(successCount === 1 ? "Image added to your globe." : `${successCount} images added to your globe.`);
    }

    if (failures.length) {
      const failureMessage = failures.slice(0, 3).join(" ");

      if (successCount) {
        showToast(`${successCount} uploaded, ${failures.length} failed. ${failureMessage}`, true);
      } else {
        showUploadError(failureMessage);
      }
    }
  } finally {
    state.uploadBusy = false;
    refs.uploadSubmitBtn.disabled = false;
    refs.uploadSubmitBtn.textContent = "Upload Images";
  }
}

async function handleShareClick() {
  if (!state.user || !state.profile) {
    showToast("Sign in first so a share link can be attached to your account.", true);
    return;
  }

  refs.shareBtn.disabled = true;

  try {
    if (!state.profile.shareEnabled) {
      await setDoc(doc(state.db, "users", state.user.uid), {
        shareEnabled: true,
        updatedAt: serverTimestamp()
      }, { merge: true });

      state.profile = {
        ...state.profile,
        shareEnabled: true
      };
    }

    await syncShareDocument(true);

    const shareUrl = buildShareUrl(state.profile.shareId);
    await copyText(shareUrl);

    refs.shareCopy.textContent = "Share link copied to your clipboard.";
    refs.shareStatus.textContent = "Live";
    showToast("Interactive share link copied.");
  } catch (error) {
    showToast(formatUploadError(error), true);
  } finally {
    refs.shareBtn.disabled = false;
  }
}

function scheduleShareSync() {
  if (!state.profile?.shareEnabled) {
    return;
  }

  clearTimeout(state.shareSyncTimer);
  state.shareSyncTimer = window.setTimeout(() => {
    syncShareDocument().catch((error) => {
      showToast(formatUploadError(error), true);
    });
  }, 500);
}

async function syncShareDocument(forceFetch = false) {
  if (!state.user || !state.profile?.shareId) {
    return;
  }

  let images = state.images;

  if (forceFetch) {
    const snapshot = await getDocs(query(
      collection(state.db, "users", state.user.uid, "images"),
      orderBy("createdAtMs", "desc")
    ));

    images = snapshot.docs.map((item) => ({
      id: item.id,
      ...item.data()
    }));
  }

const sharedImages = images.map((image) => ({
  id: image.id,
  name: image.name || "Untitled image",
  downloadURL: image.downloadURL,
  width: image.width || null,
  height: image.height || null,
  contentType: image.contentType || "image/jpeg", 
  createdAtMs: image.createdAtMs || Date.now(),
  description: image.description || "",
  likes: image.likes || 0,
  likedBy: image.likedBy || []
}));
  
  await setDoc(doc(state.db, "shared_globes", state.profile.shareId), {
    ownerUid: state.user.uid,
    ownerName: state.profile.displayName || state.user.displayName || "Orbfolio User",
    theme: state.profile.theme || "Deep Orbit",
    imageCount: sharedImages.length,
    coverImageUrl: sharedImages[0]?.downloadURL || "",
    images: sharedImages,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

function openPreview(image, allowDelete) {
  state.currentPreview = image;
  const isVideo = image.contentType && image.contentType.startsWith("video/");

  // 1. Handle Media Display
  if (isVideo) {
    refs.previewImage.hidden = true;
    refs.previewVideo.hidden = false;
    refs.previewVideo.src = image.downloadURL;
  } else {
    refs.previewImage.hidden = false;
    refs.previewVideo.hidden = true;
    refs.previewImage.src = image.downloadURL;
    refs.previewVideo.pause();
    refs.previewVideo.src = "";
  }

  // 2. Setup Base Info
  refs.previewTitle.textContent = image.name || "Untitled item";
  refs.likeCount.textContent = image.likes || 0;
  
  const isOwner = allowDelete;

if (isOwner) {
    // --- OWNER VIEW ---
    refs.previewEyebrow.hidden = false;
    refs.previewTitle.hidden = false;
    
    // Description UI
    refs.visitorDescription.hidden = true;
    refs.imageDescription.hidden = false;
    refs.imageDescription.value = image.description || "";
    refs.imageDescription.disabled = true; // Disabled until they click 'Edit'
    
    // Force the textarea to auto-size to fit existing text
    setTimeout(() => {
      refs.imageDescription.style.height = "auto";
      refs.imageDescription.style.height = (refs.imageDescription.scrollHeight) + "px";
    }, 10);
    
    // Buttons
    refs.editDescriptionBtn.hidden = false;
    refs.saveDescriptionBtn.hidden = true;
    refs.likeBtn.hidden = true; // Owners don't like their own images
    refs.deleteImageBtn.hidden = false;
    
    refs.downloadBtn.style.display = "inline-flex";
    refs.downloadBtn.href = image.downloadURL.replace('/upload/', '/upload/fl_attachment/');
  } else {
    // --- VISITOR VIEW (Shared Link) ---
    refs.imageDescription.hidden = true;
    refs.editDescriptionBtn.hidden = true;
    refs.saveDescriptionBtn.hidden = true;
    refs.deleteImageBtn.hidden = true;
    refs.downloadBtn.style.display = "none";
    
    // WE NOW ALWAYS HIDE THE EYEBROW AND TITLE FOR VISITORS
    refs.previewEyebrow.hidden = true;
    refs.previewTitle.hidden = true;
    
    if (image.description && image.description.trim() !== "") {
      // Show just the description
      refs.visitorDescription.hidden = false;
      refs.visitorDescription.textContent = image.description;
    } else {
      // MINIMAL VIEW: No description, no title, just the image and like button
      refs.visitorDescription.hidden = true;
    }
    
    refs.likeBtn.hidden = false;
    refs.likeBtn.disabled = false;
    
    // Check if current user is in the likedBy array
    const currentLikedBy = image.likedBy || [];
    const hasLiked = state.user && currentLikedBy.includes(state.user.uid);
    const likesCount = currentLikedBy.length || image.likes || 0;
    
    refs.likeBtn.innerHTML = `❤️ Likes ${likesCount}`;

    if (hasLiked) {
      // Lit Up State (User already liked it)
      refs.likeBtn.style.background = "var(--rose)";
      refs.likeBtn.style.color = "#000";
      refs.likeBtn.style.opacity = "1";
      refs.likeBtn.style.filter = "none";
    } else {
      // Greyed Out State (User hasn't liked it yet)
      refs.likeBtn.style.background = "rgba(255, 255, 255, 0.1)";
      refs.likeBtn.style.color = "var(--muted)";
      refs.likeBtn.style.opacity = "0.7";
      refs.likeBtn.style.filter = "grayscale(100%)";
    }
  }

  refs.previewModal.hidden = false;
}

function enableDescriptionEdit() {
  refs.imageDescription.disabled = false;
  refs.imageDescription.focus();
  refs.editDescriptionBtn.hidden = true;
  refs.saveDescriptionBtn.hidden = false;
}

function closePreviewModal() {
  refs.previewModal.hidden = true;
  state.currentPreview = null;
  refs.previewVideo.pause(); // Stop video audio from playing in background
  refs.previewVideo.src = "";
}

async function handleDeleteCurrentImage() {
  if (!state.user || !state.currentPreview) {
    return;
  }

  try {
    refs.deleteImageBtn.disabled = true;
    refs.deleteImageBtn.textContent = "Deleting...";
    
    // Delete document from Firestore
    await deleteDoc(doc(state.db, "users", state.user.uid, "images", state.currentPreview.id));
    
    closePreviewModal();
    showToast("Item removed from your globe.");
  } catch (error) {
    showToast(formatUploadError(error), true);
  } finally {
    refs.deleteImageBtn.disabled = false;
    refs.deleteImageBtn.textContent = "Delete";
  }
}

function openStudioHome() {
  const base = window.location.href.split("?")[0].split("#")[0];
  window.location.href = base;
}

function hideAuthError() {
  refs.authError.hidden = true;
  refs.authError.textContent = "";
}

function showAuthError(message) {
  refs.authError.hidden = false;
  refs.authError.textContent = message;
}

function hideUploadError() {
  refs.uploadError.hidden = true;
  refs.uploadError.textContent = "";
}

function showUploadError(message) {
  refs.uploadError.hidden = false;
  refs.uploadError.textContent = message;
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  refs.toast.hidden = false;
  refs.toast.textContent = message;
  refs.toast.classList.toggle("is-error", !!isError);

  state.toastTimer = window.setTimeout(() => {
    refs.toast.hidden = true;
  }, 3200);
}

function formatFirebaseError(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/email-already-in-use":
      return "That email is already attached to an account.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password combination does not match an account.";
    case "auth/weak-password":
      return "Use a stronger password with at least 6 characters.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    default:
      return error?.message || "Something went wrong while talking to Firebase.";
  }
}

function formatUploadError(error) {
  return error?.message || "That action could not finish right now.";
}

function formatPreviewMetaLegacy(image) {
  const parts = [];

  if (image.width && image.height) {
    parts.push(`${image.width} x ${image.height}`);
  }

  if (image.createdAtMs) {
    parts.push(formatDate(image.createdAtMs));
  }

  return parts.join(" · ") || "Added recently";
}

function formatDate(value) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium"
    }).format(new Date(value));
  } catch {
    return "Added recently";
  }
}

function formatPreviewMeta(image) {
  const parts = [];

  if (image.width && image.height) {
    parts.push(`${image.width} x ${image.height}`);
  }

  if (image.createdAtMs) {
    parts.push(formatDate(image.createdAtMs));
  }

  return parts.join(" - ") || "Added recently";
}

function buildShareUrl(shareId) {
  const base = window.location.href.split("?")[0].split("#")[0];
  return `${base}?share=${encodeURIComponent(shareId)}`;
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "readonly");
  field.style.position = "absolute";
  field.style.left = "-9999px";
  document.body.appendChild(field);
  field.select();
  document.execCommand("copy");
  document.body.removeChild(field);
}

function createShareId(name, uid) {
  const slug = slugify(name || "globe") || "globe";
  return `${slug}-${uid.slice(0, 8)}`;
}

function cleanFileLabel(name) {
  return name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Untitled image";
}

function readMediaMetrics(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);

    if (file.type && file.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.onloadedmetadata = () => {
        resolve({
          width: video.videoWidth,
          height: video.videoHeight
        });
        URL.revokeObjectURL(objectUrl);
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not read that video."));
      };
      video.src = objectUrl;
    } else {
      const image = new Image();
      image.onload = () => {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight
        });
        URL.revokeObjectURL(objectUrl);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not read that image."));
      };
      image.src = objectUrl;
    }
  });
}

async function uploadImageToCloudinary(file, userId, imageId) {
  if (!HAS_CLOUDINARY_CONFIG) {
    throw new Error("Cloudinary is not configured yet.");
  }

  const resourceType = file.type.startsWith("video/") ? "video" : "image";
  const endpoint = `https://api.cloudinary.com/v1_1/${encodeURIComponent(APP_CONFIG.cloudinary.cloudName)}/${resourceType}/upload`;
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", APP_CONFIG.cloudinary.uploadPreset);
  formData.append("folder", `${APP_CONFIG.cloudinary.folder}/${userId}`);
  formData.append("public_id", imageId);
  formData.append("tags", "orbfolio,user-upload");

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload?.error?.message || "Cloudinary upload failed.");
  }

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    folder: payload.folder || `${APP_CONFIG.cloudinary.folder}/${userId}`
  };
}

async function saveImageDescription() {
  if (!state.user || !state.currentPreview) return;

  try {
    refs.saveDescriptionBtn.disabled = true;
    refs.saveDescriptionBtn.textContent = "Saving...";
    const newDesc = refs.imageDescription.value.trim();

    await updateDoc(
      doc(state.db, "users", state.user.uid, "images", state.currentPreview.id),
      { description: newDesc }
    );

    // Update UI state to show visual feedback that it saved
    refs.imageDescription.disabled = true;
    refs.saveDescriptionBtn.hidden = true;
    refs.editDescriptionBtn.hidden = false;
    showToast("Description saved! ✓");
  } catch (error) {
    showToast("Failed to save description", true);
  } finally {
    refs.saveDescriptionBtn.disabled = false;
    refs.saveDescriptionBtn.textContent = "Save";
  }
}

async function handleLikeClick() {
  if (!state.currentPreview || !state.sharedDoc) return;

  if (!state.user) {
    refs.authPromptModal.hidden = false;
    return;
  }

  refs.likeBtn.disabled = true;

  const ownerUid = state.sharedDoc.ownerUid;
  const imageId = state.currentPreview.id;
  const currentLikedBy = state.currentPreview.likedBy || [];
  const hasLiked = currentLikedBy.includes(state.user.uid);

  try {
    const imageRef = doc(state.db, "users", ownerUid, "images", imageId);

    if (hasLiked) {
      // UNLIKE: Remove their ID from the list
      await updateDoc(imageRef, { likedBy: arrayRemove(state.user.uid) });
      state.currentPreview.likedBy = currentLikedBy.filter(uid => uid !== state.user.uid);
    } else {
      // LIKE: Add their ID to the list
      await updateDoc(imageRef, { likedBy: arrayUnion(state.user.uid) });
      state.currentPreview.likedBy = [...currentLikedBy, state.user.uid];
    }

    // Instantly update the UI without needing to refresh
    const newLikesCount = state.currentPreview.likedBy.length;
    refs.likeBtn.innerHTML = `❤️ Likes ${newLikesCount}`;

    if (!hasLiked) {
      refs.likeBtn.style.background = "var(--rose)";
      refs.likeBtn.style.color = "#000";
      refs.likeBtn.style.opacity = "1";
      refs.likeBtn.style.filter = "none";
    } else {
      refs.likeBtn.style.background = "rgba(255, 255, 255, 0.1)";
      refs.likeBtn.style.color = "var(--muted)";
      refs.likeBtn.style.opacity = "0.7";
      refs.likeBtn.style.filter = "grayscale(100%)";
    }

  } catch (error) {
    console.error(error);
    showToast("Could not drop a like right now.", true);
  } finally {
    refs.likeBtn.disabled = false;
  }
}

function createId() {
  if (window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }

  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function mergeConfig(base, override) {
  return {
    ...base,
    ...override,
    firebase: {
      ...base.firebase,
      ...(override.firebase || {})
    },
    cloudinary: {
      ...base.cloudinary,
      ...(override.cloudinary || {})
    },
    gallery: {
      ...base.gallery,
      ...(override.gallery || {})
    }
  };
}

function isFirebaseConfigured(firebase) {
  const config = firebase?.config;

  return !!(
    firebase?.enabled &&
    config &&
    config.apiKey &&
    config.projectId &&
    config.appId &&
    !String(config.apiKey).includes("REPLACE_ME") &&
    !String(config.projectId).includes("REPLACE_ME")
  );
}

function isCloudinaryConfigured(cloudinary) {
  return !!(
    cloudinary?.enabled &&
    cloudinary.cloudName &&
    cloudinary.uploadPreset &&
    !String(cloudinary.cloudName).includes("REPLACE_ME") &&
    !String(cloudinary.uploadPreset).includes("REPLACE_ME")
  );
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

class GlobeViewer {
  constructor(container, options = {}) {
    this.container = container;
    this.onSelect = options.onSelect || (() => {});
    this.renderToken = 0;
    this.cardMeshes = [];
    this.hoveredMesh = null;
    this.disposed = false;
    this.pointer = new THREE.Vector2(2, 2);
    this.raycaster = new THREE.Raycaster();
    this.initialPinchDistance = 0;
    this.initialCameraZ = 0;
    this.rotation = {
      x: -0.18,
      y: 0.52,
      targetX: -0.18,
      targetY: 0.52
    };
    this.drag = {
      active: false,
      moved: false,
      startX: 0, // <-- Add this
      startY: 0, // <-- Add this
      lastX: 0,
      lastY: 0
    };

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    this.camera.position.set(0, 0, 11.5);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";

    this.orbitGroup = new THREE.Group();
    this.cardsGroup = new THREE.Group();
    this.orbitGroup.add(this.cardsGroup);
    this.scene.add(this.orbitGroup);
    this.scene.add(this.createDustField());

    this.container.replaceChildren(this.renderer.domElement);

    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerLeave = this.handlePointerLeave.bind(this);
    this.handleWheel = this.handleWheel.bind(this);
    this.resize = this.resize.bind(this);
    this.animate = this.animate.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);

    this.renderer.domElement.addEventListener("pointerdown", this.handlePointerDown);
    this.renderer.domElement.addEventListener("pointermove", this.handlePointerMove);
    this.renderer.domElement.addEventListener("pointerleave", this.handlePointerLeave);
    this.renderer.domElement.addEventListener("wheel", this.handleWheel, { passive: false });
    this.renderer.domElement.addEventListener("touchstart", this.handleTouchStart, { passive: false });
    this.renderer.domElement.addEventListener("touchmove", this.handleTouchMove, { passive: false });
    window.addEventListener("pointerup", this.handlePointerUp);
    window.addEventListener("resize", this.resize);

    this.resize();
    this.animate();
  }

  createDustField() {
    const points = [];

    for (let index = 0; index < 800; index += 1) {
      const radius = 8 + Math.random() * 8;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);

      points.push(
        radius * Math.sin(phi) * Math.cos(theta),
        radius * Math.cos(phi),
        radius * Math.sin(phi) * Math.sin(theta)
      );
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));

    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0xf0ece5,
        opacity: 0.36,
        size: 0.035,
        sizeAttenuation: true,
        transparent: true
      })
    );
  }

  resize() {
    if (this.disposed) {
      return;
    }

    const bounds = this.container.getBoundingClientRect();
    const width = Math.max(bounds.width, 1);
    const height = Math.max(bounds.height, 1);

    this.camera.aspect = width / height;
    this.camera.position.z = width < 700 ? 12.4 : 11.5;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  async setImages(images) {
    this.renderToken += 1;
    const token = this.renderToken;

    this.clearCards();

    if (!images.length) {
      return;
    }

    const count = images.length;
    const radius = clamp(3.35 + Math.min(count, 300) * 0.02, 3.5, 9.0); // Grows wider
    const cardWidth = clamp(1.16 - Math.min(count, 300) * 0.002, 0.5, 1.16); // Shrinks slightly less drastically
    const cardHeight = cardWidth * 1.22;
    const anisotropy = this.renderer.capabilities.getMaxAnisotropy?.() || 1;

    const meshes = await Promise.all(images.map(async (image, index) => {
      let textureUrl = image.downloadURL;
  
      // Force video URLs to fetch a generated JPG thumbnail from Cloudinary
      if (image.contentType && image.contentType.startsWith("video/")) {
      textureUrl = textureUrl.replace(/\.[^/.]+$/, ".jpg");
   }
      textureUrl = textureUrl.replace('/upload/', '/upload/c_fill,w_400/');
      
      const texture = await createCardTexture(textureUrl, image.name, anisotropy);
      const material = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        side: THREE.DoubleSide
      });
      const geometry = createCurvedPanelGeometry(cardWidth, cardHeight, cardHeight * 1.9);
      const mesh = new THREE.Mesh(geometry, material);
      const point = fibonacciPoint(index, count, radius);
      const normal = point.clone().normalize();
      const roll = Math.sin(index * 1.4) * 0.12;

      mesh.position.copy(point);
      mesh.quaternion.copy(quaternionFromNormal(normal));
      mesh.rotateZ(roll);
      mesh.userData = {
        image,
        baseScale: 0.96 + ((index % 4) * 0.015)
      };
      mesh.scale.setScalar(mesh.userData.baseScale);

      return mesh;
    }));

    if (token !== this.renderToken || this.disposed) {
      meshes.forEach((mesh) => disposeMesh(mesh));
      return;
    }

    meshes.forEach((mesh) => {
      this.cardsGroup.add(mesh);
      this.cardMeshes.push(mesh);
    });
  }

  clearCards() {
    this.hoveredMesh = null;
    this.cardMeshes.forEach((mesh) => {
      this.cardsGroup.remove(mesh);
      disposeMesh(mesh);
    });
    this.cardMeshes = [];
  }

  handlePointerDown(event) {
    this.drag.active = true;
    this.drag.moved = false;
    this.drag.startX = event.clientX; // Record exact start point
    this.drag.startY = event.clientY;
    this.drag.lastX = event.clientX;
    this.drag.lastY = event.clientY;
    this.updatePointer(event);
    this.renderer.domElement.setPointerCapture?.(event.pointerId);
  }

  handlePointerMove(event) {
    this.updatePointer(event);

    if (!this.drag.active) {
      return;
    }

    // Check total distance from the initial click, not just frame-by-frame
    const totalDistX = Math.abs(event.clientX - this.drag.startX);
    const totalDistY = Math.abs(event.clientY - this.drag.startY);

    // Only cancel the click if they actually dragged more than 5 pixels
    if (totalDistX > 5 || totalDistY > 5) {
      this.drag.moved = true;
    }

    const deltaX = event.clientX - this.drag.lastX;
    const deltaY = event.clientY - this.drag.lastY;

    this.rotation.targetY += deltaX * 0.006;
    this.rotation.targetX += deltaY * 0.004;
    this.rotation.targetX = clamp(this.rotation.targetX, -0.9, 0.9);
    this.drag.lastX = event.clientX;
    this.drag.lastY = event.clientY;
  }

  handlePointerUp(event) {
    if (!this.drag.active) {
      return;
    }

    this.drag.active = false;
    this.updatePointer(event);

    if (!this.drag.moved) {
      const selected = this.pickCurrentImage();
      if (selected) {
        this.onSelect(selected.userData.image);
      }
    }
  }

  handlePointerLeave() {
    this.pointer.set(2, 2);
    this.hoveredMesh = null;
    this.renderer.domElement.style.cursor = "grab";
  }

handleWheel(event) {
  event.preventDefault();
  // Instead of rotation, we modify the camera's Z depth.
  // deltaY is positive when scrolling down (zoom out), negative when scrolling up (zoom in)
  const zoomSpeed = 0.02;
  this.camera.position.z += event.deltaY * zoomSpeed;
  // Clamp it so they can't zoom inside the sphere or zoom out to infinity
  // The max zoom out (28.0) accounts for a full 300-image expanded sphere
  this.camera.position.z = clamp(this.camera.position.z, 6.0, 28.0);
}

  handleTouchStart(event) {
    // If exactly two fingers are touching the screen
    if (event.touches.length === 2) {
      this.drag.active = false; // Stop the globe from rotating while zooming
      
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      
      // Calculate the initial distance between the two fingers
      this.initialPinchDistance = Math.sqrt(dx * dx + dy * dy);
      this.initialCameraZ = this.camera.position.z;
    }
  }

  handleTouchMove(event) {
    if (event.touches.length === 2) {
      event.preventDefault(); // Stop the entire browser page from zooming
      
      const dx = event.touches[0].clientX - event.touches[1].clientX;
      const dy = event.touches[0].clientY - event.touches[1].clientY;
      const currentDistance = Math.sqrt(dx * dx + dy * dy);

      if (this.initialPinchDistance > 0) {
        // Ratio > 1 means pinching in (zoom out). Ratio < 1 means pulling apart (zoom in).
        const pinchRatio = this.initialPinchDistance / currentDistance;
        this.camera.position.z = clamp(this.initialCameraZ * pinchRatio, 6.0, 28.0);
      }
    }
  }

  updatePointer(event) {
    const bounds = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -(((event.clientY - bounds.top) / bounds.height) * 2 - 1);
  }

  pickCurrentImage() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersections = this.raycaster.intersectObjects(this.cardMeshes, false);
    return intersections.find((item) => item.object?.userData?.image)?.object || null;
  }

  updateHoverState() {
    if (this.drag.active || !this.cardMeshes.length) {
      this.hoveredMesh = null;
      this.renderer.domElement.style.cursor = this.drag.active ? "grabbing" : "grab";
      return;
    }

    const hovered = this.pickCurrentImage();
    this.hoveredMesh = hovered || null;
    this.renderer.domElement.style.cursor = hovered ? "pointer" : "grab";
  }

  animate() {
    if (this.disposed) {
      return;
    }

    this.frame = window.requestAnimationFrame(this.animate);
    this.updateHoverState();

    if (!this.drag.active) {
      this.rotation.targetY += 0.0007;
    }

    this.rotation.x += (this.rotation.targetX - this.rotation.x) * 0.08;
    this.rotation.y += (this.rotation.targetY - this.rotation.y) * 0.08;

    this.orbitGroup.rotation.x = this.rotation.x;
    this.orbitGroup.rotation.y = this.rotation.y;

    this.cardMeshes.forEach((mesh) => {
      const baseScale = mesh.userData.baseScale || 1;
      const targetScale = mesh === this.hoveredMesh ? baseScale * 1.08 : baseScale;
      mesh.scale.x += (targetScale - mesh.scale.x) * 0.14;
      mesh.scale.y += (targetScale - mesh.scale.y) * 0.14;
      mesh.scale.z += (targetScale - mesh.scale.z) * 0.14;
    });

    this.renderer.render(this.scene, this.camera);
  }
}

function fibonacciPoint(index, count, radius) {
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const phi = Math.acos(1 - (2 * (index + 0.5)) / count);
  const theta = goldenAngle * index + Math.PI / 2;

  return new THREE.Vector3(
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

function quaternionFromNormal(normal) {
  const forward = normal.clone().normalize();
  let right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward);

  if (right.lengthSq() < 0.0001) {
    right = new THREE.Vector3(1, 0, 0);
  }

  right.normalize();

  const up = new THREE.Vector3().crossVectors(forward, right).normalize();
  const basis = new THREE.Matrix4().makeBasis(right, up, forward);
  const quaternion = new THREE.Quaternion();
  quaternion.setFromRotationMatrix(basis);

  return quaternion;
}

function createCurvedPanelGeometry(width, height, curveRadius) {
  const geometry = new THREE.PlaneGeometry(width, height, 24, 24);
  const position = geometry.attributes.position;

  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const z = Math.sqrt(Math.max((curveRadius * curveRadius) - (x * x) - (y * y), 0)) - curveRadius;
    position.setZ(index, z);
  }

  geometry.computeVertexNormals();
  // Add these two lines so the Raycaster knows where the bent shape actually is!
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere(); 
  
  return geometry;
}

async function createCardTexture(url, label, anisotropy) {
  let image = null;

  try {
    image = await loadRemoteImage(url);
  } catch {
    image = null;
  }

  const width = 960;
  const height = 1180;
  const inset = 28;
  const radius = 110;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  canvas.width = width;
  canvas.height = height;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "rgba(8, 18, 29, 0)";
  ctx.fillRect(0, 0, width, height);

  const drawX = inset;
  const drawY = inset;
  const drawW = width - (inset * 2);
  const drawH = height - (inset * 2);

  roundedRectPath(ctx, drawX, drawY, drawW, drawH, radius);
  ctx.save();
  ctx.clip();

  if (image) {
    const scale = Math.max(drawW / image.naturalWidth, drawH / image.naturalHeight);
    const renderW = image.naturalWidth * scale;
    const renderH = image.naturalHeight * scale;
    const renderX = drawX + ((drawW - renderW) / 2);
    const renderY = drawY + ((drawH - renderH) / 2);

    ctx.drawImage(image, renderX, renderY, renderW, renderH);
  } else {
    const fallback = ctx.createLinearGradient(0, 0, width, height);
    fallback.addColorStop(0, "#d8b98d");
    fallback.addColorStop(1, "#7fd1c5");
    ctx.fillStyle = fallback;
    ctx.fillRect(drawX, drawY, drawW, drawH);

    ctx.fillStyle = "rgba(6, 18, 31, 0.78)";
    ctx.font = "700 72px Space Grotesk";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((label || "O").trim().slice(0, 1).toUpperCase(), width / 2, height / 2);
  }

  const overlay = ctx.createLinearGradient(0, drawY, 0, drawY + drawH);
  overlay.addColorStop(0, "rgba(255, 255, 255, 0.24)");
  overlay.addColorStop(0.16, "rgba(255, 255, 255, 0.06)");
  overlay.addColorStop(1, "rgba(0, 0, 0, 0.14)");
  ctx.fillStyle = overlay;
  ctx.fillRect(drawX, drawY, drawW, drawH);
  ctx.restore();

  ctx.lineWidth = 6;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
  roundedRectPath(ctx, drawX, drawY, drawW, drawH, radius);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;

  return texture;
}

function loadRemoteImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image failed to load."));
    image.src = url;
  });
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function disposeMesh(mesh) {
  mesh.geometry?.dispose();

  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((material) => disposeMaterial(material));
  } else {
    disposeMaterial(mesh.material);
  }
}

function disposeMaterial(material) {
  material?.map?.dispose();
  material?.dispose?.();
}
