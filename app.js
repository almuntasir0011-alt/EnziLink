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
  el("modal-copy").textContent = mode === "login" ? "আপনার EnziLink অ্যাকাউন্টে প্রবেশ করুন।" : "কর্মী হিসেবে প্রোফাইল প্রকাশ করতে অথবা গ্রাহক হিসেবে অ্যাকাউন্ট তৈরি করতে পারেন।";
  el("account-submit").textContent = mode === "login" ? "লগইন করুন" : "অ্যাকাউন্ট তৈরি করুন";
  el("name-field").hidden = mode !== "join";
  el("role-field").hidden = mode !== "join";
  el("resend-confirmation").hidden = mode !== "login";
  el("account-name").required = mode === "join";
  el("account-form").reset();
  say("");
  el("account-dialog").showModal();
}
document.querySelectorAll("[data-account]").forEach(button => button.addEventListener("click", () => openAccount(button.dataset.account)));
el("account-close").addEventListener("click", () => el("account-dialog").close());

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
  const { error: workerError } = await db.from("el_worker_profiles").upsert({ user_id: user.id, is_published: false }, { onConflict: "user_id" });
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
      const role = el("account-role").value;
      const { data, error } = await db.auth.signUp({
        email: el("account-email").value.trim(), password: el("account-password").value,
        options: { data: { display_name: el("account-name").value.trim() }, emailRedirectTo: "https://almuntasir0011-alt.github.io/EnziLink/" }
      });
      if (error) throw error;
      localStorage.setItem("enzilink_requested_role", role);
      if (data.session) {
        if (role === "worker") await ensureWorkerRole();
        await refreshSession();
        say("অ্যাকাউন্ট তৈরি হয়েছে।");
      } else say("অ্যাকাউন্ট তৈরি হয়েছে। ইমেইল নিশ্চিত করে লগইন করুন। Inbox ও Spam দেখুন।");
    }
  } catch (error) { say(error.message || "অনুরোধটি সম্পন্ন করা যায়নি।"); }
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
    const phone = normalizePhone(worker.contact_phone);
    if (phone) {
      const call = document.createElement("a");
      call.className = "primary worker-call"; call.href = "tel:" + phone; call.textContent = "☎ কল করুন"; card.append(call);
    }
    const wa = whatsappUrl(worker.whatsapp_phone || worker.contact_phone);
    if (worker.whatsapp_phone && wa) {
      const message = document.createElement("a");
      message.className = "outline worker-whatsapp"; message.href = wa; message.target = "_blank"; message.rel = "noopener noreferrer"; message.textContent = "WhatsApp মেসেজ"; card.append(message);
    }
    container.append(card);
  });
}
async function searchWorkers() {
  const profession = el("profession").value.trim().toLowerCase();
  const area = el("area").value.trim().toLowerCase();
  el("status").textContent = "কর্মী খোঁজা হচ্ছে…"; el("worker-results").replaceChildren();
  try {
    const { data: workers, error } = await db.from("el_worker_profiles").select("user_id,headline,is_published,contact_phone,gender,whatsapp_phone,photo_url").eq("is_published", true).limit(100);
    if (error) throw error;
    const ids = (workers || []).map(w => w.user_id);
    if (!ids.length) { el("status").textContent = "এখনো কোনো প্রকাশিত কর্মী প্রোফাইল নেই।"; return; }
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
    if (!matches.length) { el("status").textContent = "আপনার অনুসন্ধানে কোনো কর্মী পাওয়া যায়নি।"; return; }
    el("status").textContent = matches.length + " জন কর্মী পাওয়া গেছে।";
    renderWorkerCards(matches, profiles, skills);
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
    if (profile.role !== "worker") { const { error } = await db.rpc("el_become_worker"); if (error) throw error; }
    const { data: worker, error: wError } = await db.from("el_worker_profiles").select("headline,is_published,contact_phone,gender,whatsapp_phone,photo_url").eq("user_id", user.id).maybeSingle();
    if (wError) throw wError;
    const { data: skills, error: sError } = await db.from("el_worker_skills").select("profession,skill").eq("worker_id", user.id);
    if (sError) throw sError;
    const { data: privateInfo, error: privateError } = await db.from("el_worker_private").select("date_of_birth").eq("user_id", user.id).maybeSingle();
    if (privateError) throw privateError;
    el("profile-name").value = profile.display_name || user.user_metadata?.display_name || "";
    el("profile-area").value = profile.area || "";
    el("profile-country").value = profile.country || "Bangladesh";
    el("profile-dob").value = privateInfo?.date_of_birth || "";
    el("profile-professions").value = [...new Set((skills || []).map(x => x.profession).filter(Boolean))].join(", ");
    el("profile-headline").value = worker?.headline || "";
    el("profile-phone").value = worker?.contact_phone || "";
    el("profile-whatsapp").value = worker?.whatsapp_phone || "";
    el("profile-gender").value = worker?.gender || "";
    el("profile-skills").value = [...new Set((skills || []).map(x => x.skill).filter(Boolean))].join(", ");
    el("profile-publish").checked = !!worker?.is_published;
    currentPhotoUrl = worker?.photo_url || "";
    el("photo-preview").src = currentPhotoUrl; el("photo-preview").hidden = !currentPhotoUrl;
     el("profile-dialog").querySelector("h2").textContent = worker ? "Edit Employee Profile" : "Create Employee Profile";
    el("profile-save").textContent = worker ? "Update Profile" : "Save Profile";
    el("profile-delete").hidden = !worker;
    profileSay(worker ? "Your existing profile has been loaded. Edit the details and save your changes." : "No worker profile exists for this account yet.");
  } catch (error) { profileSay(error.message || "প্রোফাইল লোড করা যায়নি।"); }
};

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
el("worker-profile-form").addEventListener("submit", async event => {
  event.preventDefault();
  const button = el("profile-save"); button.disabled = true; profileSay("সংরক্ষণ হচ্ছে…");
  try {
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) throw new Error("আবার লগইন করুন।");
    const name = el("profile-name").value.trim(), area = el("profile-area").value.trim();
    const country = el("profile-country").value.trim();
    const dob = el("profile-dob").value;
    const professions = [...new Set(el("profile-professions").value.split(",").map(x => x.trim()).filter(Boolean))];
    const headlineInput = el("profile-headline").value.trim();
    const headline = headlineInput || professions.join(" · ");
    const phone = el("profile-phone").value.trim();
    const whatsapp = el("profile-whatsapp").value.trim();
    const skills = [...new Set(el("profile-skills").value.split(",").map(x => x.trim()).filter(Boolean))];
    const published = el("profile-publish").checked;
    if (!name || !area || !country || !dob || !professions.length || !phone) throw new Error("Name, country, city/area, date of birth, at least one profession and phone number are required.");
    const adultCutoff = new Date(); adultCutoff.setHours(0,0,0,0); adultCutoff.setFullYear(adultCutoff.getFullYear()-18);
    const dobDate = new Date(dob + "T00:00:00");
    if (Number.isNaN(dobDate.getTime()) || dobDate > adultCutoff) {
      if (published) throw new Error("Public worker profiles are available only to adults aged 18 or older.");
    }
    if (normalizePhone(phone).replace(/\D/g, "").length < 7) throw new Error("সঠিক ফোন নম্বর লিখুন।");
    if (whatsapp && normalizePhone(whatsapp).replace(/\D/g, "").length < 7) throw new Error("সঠিক WhatsApp নম্বর লিখুন।");
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
      user_id: user.id, headline, contact_phone: phone, whatsapp_phone: whatsapp || null,
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
    el("profile-photo").value = ""; searchWorkers();
  } catch (error) { profileSay(error.message || "প্রোফাইল সংরক্ষণ করা যায়নি।"); }
  finally { button.disabled = false; }
});
const dobMax = new Date(); dobMax.setHours(0,0,0,0); dobMax.setFullYear(dobMax.getFullYear()-18);
el("profile-dob").max = [dobMax.getFullYear(), String(dobMax.getMonth()+1).padStart(2,"0"), String(dobMax.getDate()).padStart(2,"0")].join("-");
el("year").textContent = new Date().getFullYear();
window.addEventListener("load", async () => { try { await refreshSession(); } catch (_) {} await searchWorkers(); });
