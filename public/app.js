const imageInput = document.getElementById("imageInput");
const previewImage = document.getElementById("previewImage");
const textPrompt = document.getElementById("textPrompt");
const planButton = document.getElementById("planButton");
const statusDiv = document.getElementById("status");
const resultsDiv = document.getElementById("results");
const myTripsDiv = document.getElementById("myTrips"); // My Trips section

let imageBase64 = null;

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const dataUrl = e.target.result;
    previewImage.src = dataUrl;
    previewImage.style.display = "block";
    imageBase64 = dataUrl.split(",")[1];
  };
  reader.readAsDataURL(file);
});

planButton.addEventListener("click", async () => {
  const text = textPrompt.value.trim();

  if (!text && !imageBase64) {
    alert("Please upload an image or type some aesthetic keywords.");
    return;
  }

  planButton.disabled = true;
  statusDiv.textContent = "Generating your trip plan...";
  resultsDiv.innerHTML = "";

  try {
    // figure out current user (from Supabase auth helper, if present)
    let userIdentifier = "guest";
    if (window.getCurrentUser) {
      const user = await window.getCurrentUser();
      if (user && user.email) userIdentifier = user.email;
    }

    const res = await fetch("/api/plan-trip", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        textPrompt: text,
        imageBase64,
        userIdentifier
      })
    });

    if (!res.ok) {
      throw new Error("API error");
    }

    const data = await res.json();

    renderResponse(data.response || "No response generated.");
    statusDiv.textContent = "✨ Your trip plan is ready!";

    // refresh My Trips if logged-in
    if (userIdentifier !== "guest") {
      loadMyTrips(userIdentifier);
    }
  } catch (err) {
    console.error(err);
    statusDiv.textContent = "Something went wrong. Please try again.";
  } finally {
    planButton.disabled = false;
  }
});

function renderResponse(text) {
  resultsDiv.innerHTML = "";

  const card = document.createElement("div");
  card.className = "result-card";
  card.style.maxWidth = "900px";
  card.style.margin = "0 auto";

  const title = document.createElement("h2");
  title.textContent = "✨ Your AI Trip Plan ✨";

  const body = document.createElement("div");
  body.style.fontSize = "1.05rem";
  body.style.lineHeight = "1.7";
  body.style.whiteSpace = "pre-wrap";
  body.innerHTML = text.replace(/\n/g, "<br/>");

  card.appendChild(title);
  card.appendChild(body);

  // Save Trip button (manual save with a name)
  const saveButton = document.createElement("button");
  saveButton.textContent = "💾 Save My Trip";
  saveButton.style.background = "#10b981";
  saveButton.style.color = "white";
  saveButton.style.border = "none";
  saveButton.style.padding = "12px 24px";
  saveButton.style.borderRadius = "8px";
  saveButton.style.cursor = "pointer";
  saveButton.style.marginTop = "20px";

  saveButton.onclick = async () => {
    const guestName = prompt("Enter your name/email to save:");
    if (!guestName) return;

    try {
      const saveRes = await fetch("/api/save-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guestName: guestName.trim(),
          tripPlan: text,
          aestheticPrompt: textPrompt.value.trim()
        })
      });

      const saveData = await saveRes.json();
      alert(saveData.message || "Trip saved");

      // also reload My Trips
      loadMyTrips(guestName.trim());
    } catch (err) {
      console.error(err);
      alert("Failed to save trip");
    }
  };

  card.appendChild(saveButton);
  resultsDiv.appendChild(card);
}

// Load trips for a given user_identifier (email/name)
async function loadMyTrips(userIdentifier) {
  if (!userIdentifier) return;

  try {
    const res = await fetch(
      `/api/my-trips?user=${encodeURIComponent(userIdentifier)}`
    );
    if (!res.ok) return;

    const data = await res.json();
    renderMyTrips(data.trips || []);
  } catch (err) {
    console.error("Failed to load trips", err);
  }
}

function renderMyTrips(trips) {
  if (!myTripsDiv) return;

  myTripsDiv.innerHTML = "";

  if (!trips.length) {
    myTripsDiv.textContent = "No trips saved yet.";
    return;
  }

  trips.forEach(trip => {
    const card = document.createElement("div");
    card.className = "result-card";
    card.style.maxWidth = "900px";
    card.style.margin = "0 auto";

    const title = document.createElement("h3");
    title.textContent = trip.prompt || "Saved trip";

    const body = document.createElement("div");
    body.style.fontSize = "0.95rem";
    body.style.lineHeight = "1.6";
    body.style.whiteSpace = "pre-wrap";
    body.textContent = trip.plan?.text || "";

    const small = document.createElement("div");
    small.style.fontSize = "0.8rem";
    small.style.color = "#aaa";
    if (trip.created_at) {
      small.textContent = new Date(trip.created_at).toLocaleString();
    }

    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(small);

    myTripsDiv.appendChild(card);
  });
}


window.loadMyTrips = loadMyTrips;
