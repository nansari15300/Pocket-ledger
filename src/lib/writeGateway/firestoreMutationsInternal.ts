/**
 * Sirf `writeGateway/**` + `localVoucherOutbox` yahan se Firestore mutation APIs import karein —
 * ESLint `no-restricted-imports` baaki `src/lib` (aur baad mein UI) me direct `firebase/firestore` mutation import rokta hai.
 */
export { addDoc, collection, deleteDoc, doc, setDoc, updateDoc, runTransaction, writeBatch } from "firebase/firestore";
