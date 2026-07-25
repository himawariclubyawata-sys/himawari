import {
<<<<<<< HEAD
  addDoc,
=======
>>>>>>> 4b441ae (初版　最終変更反映)
  collection,
  getDocs,
  limit,
  query,
<<<<<<< HEAD
  setDoc,
=======
>>>>>>> 4b441ae (初版　最終変更反映)
  where
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

export const settingCodes = Object.freeze({
<<<<<<< HEAD
  announcementPassword: "adminPass",
  contactF: "ContactF",
  contactEmail: "MailAddress"
=======
  announcementPassword: "adminPass"
>>>>>>> 4b441ae (初版　最終変更反映)
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
<<<<<<< HEAD

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
=======
>>>>>>> 4b441ae (初版　最終変更反映)
