'use client'
import { firestore as db } from '@/lib/firebase'
import { collection, doc, getDocs, getDoc, query, where, updateDoc, addDoc, serverTimestamp, type Firestore } from 'firebase/firestore'
import type { Role } from '@/utils/rbac'

export async function getCompany(companyId: string) {
  const snap = await getDoc(doc(db, 'companies', companyId))
  return { id: snap.id, ...snap.data() } as any
}

export async function listUsers(db: Firestore, companyId?: string) {
  const ref = collection(db, 'users')
  const q = companyId ? query(ref, where('companyId', '==', companyId)) : ref
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function updateUserRole(userId: string, role: Role) {
  await updateDoc(doc(db, 'users', userId), { role })
}

export async function toggleCompanyFeature(companyId: string, key: string, value: boolean) {
  const companyRef = doc(db, 'companies', companyId)
  const snap = await getDoc(companyRef)
  if (!snap.exists()) {
    throw new Error('This company has not synced to the server yet. Connect to the internet and wait for sync, then try again.')
  }
  await updateDoc(companyRef, { [`settings.${key}`]: value })
}

export async function logActivity(payload: any) {
  await addDoc(collection(db, 'activity_logs'), {
    ...payload,
    at: serverTimestamp(),
  })
}
