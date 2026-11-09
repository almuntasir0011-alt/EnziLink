const SUPABASE_URL = "https://dihxwbpkltjdvqzmfnmz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_jrSQsPIaJui421VMa6wUbQ_Y-S8uhK4";
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
const el = id => document.getElementById(id);
const say = value => { el("message").textContent = value; };
const profileSay = value => { el("profile-message").textContent = value; };
let mode = "login";
let currentPhotoUrl = "";
let currentUserId = null;

function openAccount(nextMode) {
  mode = nextMode;
  el("modal-title").textContent = mode === "login" ? "লগইন" : "EnziLink-এ যুক্ত হোন";
  el("modal-copy").textContent = mode === "login" ? "আপনার EnziLink অ্যাকাউন্টে প্রবেশ করুন।" : "একটি অ্যাকাউন্ট তৈরি করুন। পরে একই অ্যাকাউন্টে গ্রাহক ও কর্মী—দুই সুবিধাই ব্যবহার করতে পারবেন।";
  el("account-submit").textContent = mode === "login" ? "লগইন করুন" : "অ্যাকাউন্ট তৈরি করুন";
  el("name-field").hidden = mode !== "join";
  el("resend-confirmation").hidden = mode !== "login";
  el("account-name").required = mode === "join";
  el("account-form").reset();
  say("");
  el("account-dialog").showModal();
}
document.querySelectorAll("[data-account]").forEach(button => button.addEventListener("click", () => openAccount(button.dataset.account)));
el("account-close").addEventListener("click", () => el("account-dialog").close());

el("password-toggle").addEventListener("click", () => {
  const input = el("account-password");
  const showing = input.type === "text";
  input.type = showing ? "password" : "text";
  el("password-toggle").textContent = showing ? "দেখান" : "লুকান";
  el("password-toggle").setAttribute("aria-label", showing ? "পাসওয়ার্ড দেখান" : "পাসওয়ার্ড লুকান");
  el("password-toggle").setAttribute("aria-pressed", String(!showing));
});

function friendlyAuthError(error) {
  const message = String(error?.message || "").toLowerCase();
  if (message.includes("invalid login credentials")) return "ইমেইল অথবা পাসওয়ার্ড সঠিক নয়। আবার পরীক্ষা করে লিখুন।";
  if (message.includes("email not confirmed")) return "আপনার ইমেইল এখনো নিশ্চিত করা হয়নি। Inbox/Spam থেকে নিশ্চিত করুন।";
  if (message.includes("too many requests")) return "অনেকবার চেষ্টা করা হয়েছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।";
  if (message.includes("network") || message.includes("fetch")) return "ইন্টারনেট সংযোগ বা সার্ভারে সমস্যা হয়েছে। সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।";
  return error?.message || "লগইন করা যায়নি। আবার চেষ্টা করুন।";
}

el("resend-confirmation").addEventListener("click", async () => {
  const email = el("account-email").value.trim();
  if (!email) { say("আগে নিবন্ধিত ইমেইল ঠিকানাটি লিখুন।"); return; }
  try {
    const { error } = await db.auth.resend({ type: "signup", email, options: { emailRedirectTo: "https://almuntasir0011-alt.github.io/EnziLink/" } });
    if (error) throw error;
    say("নিশ্চিতকরণ ইমেইল পাঠানোর অনুরোধ করা হয়েছে। Inbox ও Spam দেখুন।");
  } catch (error) { say(error.message || "ইমেইল পাঠানো যায়নি।"); }
});

async function ensureWorkerRole() {
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) throw new Error("প্রথমে লগইন করুন।");
  const { data: profile, error } = await db.from("el_profiles").select("role").eq("id", user.id).single();
  if (error) throw error;
  if (profile.role !== "worker") {
    const { error: roleError } = await db.rpc("el_become_worker");
    if (roleError) throw roleError;
  }
  const { error: workerError } = await db.from("el_worker_profiles").upsert({ user_id: user.id, is_published: false }, { onConflict: "user_id", ignoreDuplicates: true });
  if (workerError) throw workerError;
}
async function refreshSession() {
  const { data: { user } } = await db.auth.getUser();
  currentUserId = user?.id || null;
  el("session-note").textContent = user ? "লগইন করা আছে: " + (user.email || "EnziLink account") : "কর্মী প্রোফাইল তৈরি করতে লগইন করুন। গ্রাহকদের লগইন ছাড়াই কর্মী খোঁজা যাবে।";
}
el("account-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = el("account-submit");
  button.disabled = true;
  try {
    if (mode === "login") {
      const { error } = await db.auth.signInWithPassword({ email: el("account-email").value.trim(), password: el("account-password").value });
      if (error) throw error;
      await refreshSession();
      await searchWorkers();
      say("লগইন সফল হয়েছে।");
      setTimeout(() => el("account-dialog").close(), 500);
    } else {
      const { data, error } = await db.auth.signUp({
        email: el("account-email").value.trim(), password: el("account-password").value,
        options: { data: { display_name: el("account-name").value.trim() }, emailRedirectTo: "https://almuntasir0011-alt.github.io/EnziLink/" }
      });
      if (error) throw error;
      if (data.session) {
        await refreshSession();
        say("অ্যাকাউন্ট তৈরি হয়েছে।");
      } else say("অ্যাকাউন্ট তৈরি হয়েছে। ইমেইল নিশ্চিত করে লগইন করুন। Inbox ও Spam দেখুন।");
    }
  } catch (error) { say(mode === "login" ? friendlyAuthError(error) : (error.message || "অনুরোধটি সম্পন্ন করা যায়নি।")); }
  finally { button.disabled = false; }
});

function normalizePhone(value) {
  const bn = "০১২৩৪৫৬৭৮৯";
  return String(value || "").replace(/[০-৯]/g, d => String(bn.indexOf(d))).replace(/[^0-9+]/g, "");
}
function whatsappUrl(value) {
  let digits = normalizePhone(value).replace(/\D/g, "");
  if (digits.startsWith("0")) digits = "88" + digits;
  return digits ? "https://wa.me/" + digits : "";
}
function workerEmoji(headline) {
  const value = String(headline || "").toLowerCase();
  if (/electric|electrical|বিদ্যুৎ|ইলেক/.test(value)) return "⚡";
  if (/plumb|প্লাম্ব/.test(value)) return "🔧";
  if (/weld|ওয়েল্ড/.test(value)) return "🧑‍🏭";
  if (/paint|পেইন্ট/.test(value)) return "🎨";
  if (/carpent|কাঠ/.test(value)) return "🪚";
  if (/ac|air condition|এসি/.test(value)) return "❄️";
  if (/clean|ক্লিন/.test(value)) return "🧹";
  if (/mason|রাজমিস্ত্রি/.test(value)) return "🧱";
  return "🧰";
}
function renderWorkerCards(workers, profiles, skills) {
  const container = el("worker-results");
  container.replaceChildren();
  workers.forEach(worker => {
    const profile = profiles.get(worker.user_id) || {};
    const workerSkills = skills.get(worker.user_id) || [];
    const card = document.createElement("article");
    card.className = "worker-card";
    const avatar = document.createElement("div");
    avatar.className = "worker-avatar";
    if (worker.photo_url) {
      const img = document.createElement("img");
      img.src = worker.photo_url; img.alt = "কর্মীর প্রোফাইল ছবি"; avatar.append(img);
    } else avatar.textContent = workerEmoji(worker.headline);
    const name = document.createElement("h3");
    name.textContent = profile.display_name || "EnziLink কর্মী";
    const headline = document.createElement("p");
    headline.className = "worker-headline"; headline.textContent = worker.headline || "দক্ষ কর্মী";
    const details = document.createElement("p");
    details.className = "worker-meta";
    const gender = worker.gender === "male" ? "পুরুষ" : worker.gender === "female" ? "মহিলা" : "";
    details.textContent = [profile.area, profile.country, gender].filter(Boolean).join(" · ") || "লোকেশন উল্লেখ নেই";
    const skillsLine = document.createElement("p");
    skillsLine.className = "worker-skills";
    skillsLine.textContent = "দক্ষতা: " + (workerSkills.map(s => s.skill || s.profession).filter(Boolean).join(", ") || worker.headline || "তথ্য যোগ করা হয়নি");
    card.append(avatar, name, headline, details, skillsLine);
    if (currentUserId && currentUserId === worker.user_id) {
      const edit = document.createElement("button");
      edit.type = "button"; edit.className = "outline worker-contact"; edit.textContent = "Edit Profile";
      edit.addEventListener("click", () => window.openEnziLinkProfile());
      card.append(edit);
    }
    container.append(card);
  });
}
async function renderOwnPrivateProfile(existingIds = []) {
  if (!currentUserId || existingIds.includes(currentUserId)) return;
  const [{ data: worker, error: workerError }, { data: profile, error: profileError }, { data: skills, error: skillsError }] = await Promise.all([
    db.from("el_worker_profiles").select("user_id,headline,photo_url,is_published").eq("user_id", currentUserId).maybeSingle(),
    db.from("el_profiles").select("id,display_name,area,country").eq("id", currentUserId).maybeSingle(),
    db.from("el_worker_skills").select("worker_id,profession,skill").eq("worker_id", currentUserId)
  ]);
  if (workerError) throw workerError;
  if (profileError) throw profileError;
  if (skillsError) throw skillsError;
  if (!worker || worker.is_published || !profile) return;

  const savedSkills = skills || [];
  const professions = [...new Set(savedSkills.map(x => x.profession).filter(Boolean))];
  const skillNames = [...new Set(savedSkills.map(x => x.skill).filter(Boolean))];
  const card = document.createElement("article");
  card.className = "worker-card own-private-profile";

  const top = document.createElement("div");
  top.className = "worker-profile-top";
  const avatar = document.createElement("div");
  avatar.className = "worker-avatar";
  if (worker.photo_url) {
    const img = document.createElement("img");
    img.src = worker.photo_url;
    img.alt = "Your profile photo";
    avatar.append(img);
  } else {
    avatar.textContent = workerEmoji(worker.headline || professions.join(" "));
  }
  const identity = document.createElement("div");
  identity.className = "worker-profile-identity";
  const heading = document.createElement("h3");
  heading.textContent = profile.display_name || "Your worker profile";
  const status = document.createElement("p");
  status.className = "worker-private-status";
  status.textContent = "PRIVATE PROFILE · Only visible to you";
  identity.append(heading, status);
  top.append(avatar, identity);

  const headline = document.createElement("p");
  headline.className = "worker-headline";
  headline.textContent = worker.headline || "Add a professional headline in Edit Profile";

  const details = document.createElement("p");
  details.className = "worker-meta";
  details.textContent = [profile.area, profile.country].filter(Boolean).join(" · ") || "Add your work area and country";

  const professionLine = document.createElement("p");
  professionLine.className = "worker-skills";
  professionLine.textContent = "Professions: " + (professions.join(", ") || "Add your professions in Edit Profile");

  const skillLine = document.createElement("p");
  skillLine.className = "worker-skills";
  skillLine.textContent = "Skills: " + (skillNames.join(", ") || "Add your skills in Edit Profile");

  const completeness = [
    !!profile.display_name, !!profile.area, !!profile.country,
    !!worker.headline, !!worker.photo_url, professions.length > 0, skillNames.length > 0
  ].filter(Boolean).length;
  const progress = document.createElement("p");
  progress.className = "worker-profile-completion";
  progress.textContent = "Profile details added: " + completeness + " of 7";

  const note = document.createElement("p");
  note.className = "worker-meta";
  note.textContent = "Your profile is not visible to customers while it is private. Public listing requires eligibility and your consent.";

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "outline worker-contact";
  edit.textContent = "Edit Profile";
  edit.addEventListener("click", () => window.openEnziLinkProfile());

  card.append(top, headline, details, professionLine, skillLine, progress, note, edit);
  el("worker-results").prepend(card);
}

async function searchWorkers() {
  const profession = el("profession").value.trim().toLowerCase();
  const area = el("area").value.trim().toLowerCase();
  el("status").textContent = "কর্মী খোঁজা হচ্ছে…"; el("worker-results").replaceChildren();
  try {
    const { data: workers, error } = await db.from("el_worker_profiles").select("user_id,headline,is_published,gender,photo_url").eq("is_published", true).limit(100);
    if (error) throw error;
    const ids = (workers || []).map(w => w.user_id);
    if (!ids.length) {
      el("status").textContent = "এখনো কোনো প্রকাশিত কর্মী প্রোফাইল নেই।";
      await renderOwnPrivateProfile([]);
      return;
    }
    const [p, s] = await Promise.all([
      db.from("el_profiles").select("id,display_name,area,country").in("id", ids),
      db.from("el_worker_skills").select("worker_id,profession,skill").in("worker_id", ids)
    ]);
    if (p.error) throw p.error; if (s.error) throw s.error;
    const profiles = new Map((p.data || []).map(x => [x.id, x]));
    const skills = new Map();
    (s.data || []).forEach(x => { if (!skills.has(x.worker_id)) skills.set(x.worker_id, []); skills.get(x.worker_id).push(x); });
    const matches = workers.filter(w => {
      const profile = profiles.get(w.user_id) || {};
      const workerSkills = skills.get(w.user_id) || [];
      const professionMatch = !profession || (w.headline || "").toLowerCase().includes(profession) || workerSkills.some(x => ((x.profession || "") + " " + (x.skill || "")).toLowerCase().includes(profession));
      const areaMatch = !area || ((profile.area || "") + " " + (profile.country || "")).toLowerCase().includes(area);
      return professionMatch && areaMatch;
    });
    if (!matches.length) el("status").textContent = "আপনার অনুসন্ধানে কোনো প্রকাশিত কর্মী পাওয়া যায়নি।";
    else {
      el("status").textContent = matches.length + " জন কর্মী পাওয়া গেছে।";
      renderWorkerCards(matches, profiles, skills);
    }
    await renderOwnPrivateProfile(matches.map(w => w.user_id));
  } catch (error) { el("status").textContent = "কর্মী তালিকা লোড হয়নি: " + (error.message || "Unknown error"); }
}
el("search-form").addEventListener("submit", event => { event.preventDefault(); searchWorkers(); });
document.querySelectorAll("[data-cat]").forEach(button => button.addEventListener("click", () => {
  el("profession").value = button.dataset.cat; el("find").scrollIntoView({ behavior: "smooth" }); searchWorkers();
}));

window.openEnziLinkProfile = async () => {
  el("profile-dialog").showModal(); profileSay("অ্যাকাউন্ট যাচাই করা হচ্ছে…");
  try {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError) throw authError;
    if (!user) { el("profile-dialog").close(); openAccount("login"); say("কর্মী প্রোফাইল তৈরি বা সম্পাদনা করতে লগইন করুন।"); return; }
    const { data: profile, error: pError } = await db.from("el_profiles").select("display_name,role,area,country").eq("id", user.id).single();
    if (pError) throw pError;
    const isWorker = profile.role === "worker";
    el("worker-fields").hidden = !isWorker;
    el("become-worker").hidden = isWorker;
    ["profile-dob","profile-professions"].forEach(id => { el(id).required = isWorker; });
    el("profile-description").textContent = isWorker
      ? "আপনার কর্মী প্রোফাইল দেখুন, সম্পাদনা করুন এবং প্রকাশের অবস্থা নিয়ন্ত্রণ করুন।"
      : "আপনার কাস্টমার প্রোফাইল শুধু আপনি দেখতে পারবেন। নিজের নাম ও এলাকা সম্পাদনা করে সংরক্ষণ করুন।";
    const { data: worker, error: wError } = isWorker
      ? await db.from("el_worker_profiles").select("headline,is_published,gender,photo_url").eq("user_id", user.id).maybeSingle()
      : { data: null, error: null };
    if (wError) throw wError;
    const { data: skills, error: sError } = isWorker
      ? await db.from("el_worker_skills").select("profession,skill").eq("worker_id", user.id)
      : { data: [], error: null };
    if (sError) throw sError;
    const { data: privateInfo, error: privateError } = isWorker
      ? await db.from("el_worker_private").select("date_of_birth").eq("user_id", user.id).maybeSingle()
      : { data: null, error: null };
    if (privateError) throw privateError;
    el("profile-name").value = profile.display_name || user.user_metadata?.display_name || "";
    el("profile-area").value = profile.area || "";
    el("profile-country").value = profile.country || "Bangladesh";
    el("profile-dob").value = privateInfo?.date_of_birth || "";
    el("profile-professions").value = [...new Set((skills || []).map(x => x.profession).filter(Boolean))].join(", ");
    el("profile-headline").value = worker?.headline || "";
    el("profile-gender").value = worker?.gender || "";
    el("profile-skills").value = [...new Set((skills || []).map(x => x.skill).filter(Boolean))].join(", ");
    if (isWorker) {
      el("profile-publish").checked = !!worker?.is_published;
      currentPhotoUrl = worker?.photo_url || "";
      el("photo-preview").src = currentPhotoUrl; el("photo-preview").hidden = !currentPhotoUrl;
    } else {
      currentPhotoUrl = "";
      el("photo-preview").hidden = true;
    }
    el("profile-dialog").querySelector("h2").textContent = isWorker
      ? (worker ? "Edit Worker Profile" : "Create Worker Profile")
      : "My Customer Profile";
    el("profile-save").textContent = isWorker
      ? (worker ? "Update Profile" : "Save Worker Profile")
      : "Save Customer Profile";
    el("profile-delete").hidden = !isWorker || !worker;
    profileSay(isWorker
      ? (worker ? "আপনার প্রোফাইল লোড হয়েছে। প্রয়োজন হলে তথ্য সম্পাদনা করুন।" : "কর্মী হিসেবে কাজ করতে নিচের তথ্য পূরণ করুন।")
      : "আপনার প্রোফাইল লোড হয়েছে। চাইলে পরে কর্মী প্রোফাইলও যোগ করতে পারবেন।");
  } catch (error) { profileSay(error.message || "প্রোফাইল লোড করা যায়নি।"); }
};

el("become-worker").addEventListener("click", async () => {
  const button = el("become-worker"); button.disabled = true;
  try {
    await ensureWorkerRole();
    await window.openEnziLinkProfile();
  } catch (error) {
    profileSay(error.message || "কর্মী প্রোফাইল চালু করা যায়নি।");
  } finally { button.disabled = false; }
});

el("profile-delete").addEventListener("click", async () => {
  if (!window.confirm("Delete your worker profile? Your login account will remain, but your public worker listing and skills will be removed.")) return;
  const button = el("profile-delete"); button.disabled = true;
  try {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) throw new Error("Please log in again.");
    const { error: workerError } = await db.from("el_worker_profiles").delete().eq("user_id", user.id);
    if (workerError) throw workerError;
    const { error: skillsError } = await db.from("el_worker_skills").delete().eq("worker_id", user.id);
    if (skillsError) throw skillsError;
    const { error: privateError } = await db.from("el_worker_private").delete().eq("user_id", user.id);
    if (privateError) throw privateError;
    await db.storage.from("worker-photos").remove([
      user.id + "/profile.jpg", user.id + "/profile.png", user.id + "/profile.webp"
    ]);
    currentPhotoUrl = "";
    el("profile-dialog").close();
    await searchWorkers();
    profileSay("Your worker profile has been deleted. Your EnziLink login account is still active.");
  } catch (error) {
    profileSay(error.message || "The worker profile could not be deleted.");
  } finally { button.disabled = false; }
});

el("profile-photo").addEventListener("change", () => {
  const file = el("profile-photo").files?.[0]; if (!file) return;
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size > 3 * 1024 * 1024) {
    profileSay("JPG, PNG বা WEBP ছবি দিন; সর্বোচ্চ ৩ MB।"); el("profile-photo").value = ""; return;
  }
  el("photo-preview").src = URL.createObjectURL(file); el("photo-preview").hidden = false;
});
el("profile-close").addEventListener("click", () => el("profile-dialog").close());

el("profile-switch-account").addEventListener("click", async () => {
  const button = el("profile-switch-account"); button.disabled = true;
  try {
    const { error } = await db.auth.signOut();
    if (error) throw error;
    currentUserId = null;
    await refreshSession();
    el("profile-dialog").close();
    openAccount("login");
    say("Signed out. Log in with the email account that owns the existing worker profile to edit it.");
  } catch (error) {
    profileSay(error.message || "Could not switch accounts. Please try again.");
  } finally { button.disabled = false; }
});
el("worker-profile-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = el("profile-save"); button.disabled = true; profileSay("সংরক্ষণ হচ্ছে…");
  try {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) throw new Error("আবার লগইন করুন।");
    const { data: accountProfile, error: accountProfileError } = await db.from("el_profiles").select("role").eq("id", user.id).single();
    if (accountProfileError) throw accountProfileError;
    const isWorker = accountProfile.role === "worker";
    const name = el("profile-name").value.trim(), area = el("profile-area").value.trim();
    const country = el("profile-country").value.trim();
    if (!name || !area || !country) throw new Error("Name, country and city/area are required.");
    if (!isWorker) {
      const { error: customerUpdateError } = await db.from("el_profiles").update({
        display_name: name, area, country, updated_at: new Date().toISOString()
      }).eq("id", user.id);
      if (customerUpdateError) throw customerUpdateError;
      profileSay("আপনার কাস্টমার প্রোফাইল সংরক্ষিত হয়েছে। এটি শুধু আপনি দেখতে পারবেন।");
      await refreshSession();
      return;
    }
    await ensureWorkerRole();
    const dob = el("profile-dob").value;
    const professions = [...new Set(el("profile-professions").value.split(",").map(x => x.trim()).filter(Boolean))];
    const headlineInput = el("profile-headline").value.trim();
    const headline = headlineInput || professions.join(" · ");
    const skills = [...new Set(el("profile-skills").value.split(",").map(x => x.trim()).filter(Boolean))];
    const published = el("profile-publish").checked;
    if (!dob || !professions.length) throw new Error("Date of birth and at least one profession are required.");
    const adultCutoff = new Date(); adultCutoff.setHours(0,0,0,0); adultCutoff.setFullYear(adultCutoff.getFullYear()-18);
    const dobDate = new Date(dob + "T00:00:00");
    if (Number.isNaN(dobDate.getTime()) || dobDate > adultCutoff) {
      if (published) throw new Error("Public worker profiles are available only to adults aged 18 or older.");
    }
    if (published && !el("profile-adult").checked) throw new Error("প্রোফাইল প্রকাশ করতে হলে নিশ্চিত করুন আপনার বয়স ১৮ বছর বা তার বেশি।");
    if (published && !el("profile-consent").checked) throw new Error("প্রোফাইল প্রকাশের আগে তথ্য প্রকাশের সম্মতি দিন।");
    const photo = el("profile-photo").files?.[0]; let photoUrl = currentPhotoUrl;
    if (photo) {
      const ext = photo.type === "image/png" ? "png" : photo.type === "image/webp" ? "webp" : "jpg";
      const path = user.id + "/profile." + ext;
      const { error: uploadError } = await db.storage.from("worker-photos").upload(path, photo, { upsert: true, contentType: photo.type, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const { data } = db.storage.from("worker-photos").getPublicUrl(path); photoUrl = data.publicUrl;
    }
    const { error: privateError } = await db.from("el_worker_private").upsert({ user_id: user.id, date_of_birth: dob, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
    if (privateError) throw privateError;
    const { error: pError } = await db.from("el_profiles").update({ display_name: name, area, country, updated_at: new Date().toISOString() }).eq("id", user.id);
    if (pError) throw pError;
    const { error: wError } = await db.from("el_worker_profiles").upsert({
      user_id: user.id, headline, contact_phone: null, whatsapp_phone: null,
      gender: el("profile-gender").value || null, photo_url: photoUrl || null,
      is_published: published, updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });
    if (wError) throw wError;
    const { error: dError } = await db.from("el_worker_skills").delete().eq("worker_id", user.id);
    if (dError) throw dError;
    const skillRows = [
      ...professions.map(profession => ({ worker_id: user.id, profession, skill: null })),
      ...skills.map(skill => ({ worker_id: user.id, profession: professions[0], skill }))
    ];
    const { error: sError } = await db.from("el_worker_skills").insert(skillRows);
    if (sError) throw sError;
    currentPhotoUrl = photoUrl;
    profileSay(published ? "আপনার প্রোফাইল প্রকাশিত হয়েছে। গ্রাহকরা এখন দেখতে পারবেন।" : "প্রোফাইল সংরক্ষিত হয়েছে, কিন্তু প্রকাশিত নয়।");
    el("profile-photo").value = ""; await searchWorkers();
  } catch (error) { profileSay(error.message || "প্রোফাইল সংরক্ষণ করা যায়নি।"); }
  finally { button.disabled = false; }
});
el("year").textContent = new Date().getFullYear();
window.addEventListener("load", async () => { try { await refreshSession(); } catch (_) {} await searchWorkers(); });
