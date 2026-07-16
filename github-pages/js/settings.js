import {
  addDoc,
  collection,
  getDocs,
  limit,
  query,
  setDoc,
  where
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

export const settingCodes = Object.freeze({
  announcementPassword: "adminPass",
  contactF: "ContactF",
  contactEmail: "MailAddress"
});

export const getSettingString = async (db, settingCode, fallback = "") => {
  const snapshot = await getDocs(query(
    collection(db, "settings"),
    where("Code", "==", settingCode),
    limit(1)
  ));
  if (snapshot.empty) {
    return fallback;
  }

  const setting = snapshot.docs[0].data().setting;
  if (typeof setting !== "string") {
    return fallback;
  }

  return setting;
};

export const setSettingString = async (db, settingCode, value) => {
  const snapshot = await getDocs(query(
    collection(db, "settings"),
    where("Code", "==", settingCode),
    limit(1)
  ));
  const data = {
    Code: settingCode,
    setting: String(value)
  };

  if (snapshot.empty) {
    await addDoc(collection(db, "settings"), data);
    return;
  }

  await setDoc(snapshot.docs[0].ref, data);
};
