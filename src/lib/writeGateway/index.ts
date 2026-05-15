/** Company data writes — `writeEntity` ko naye code me prefer karo (SQLite + outbox + plan gate ek pipeline). */
export { writeEntity, writeEntityNonBlocking, type WriteEntityOperation, type WriteEntityRequest, type WriteEntityResult } from "./writeEntity";
export { updateCompanyRootFirestore, setCompanyRootFirestoreMerge } from "./companyRootFirestore";
export { appendPaymentsCollectionDoc, appendAdminNotificationDoc, appendActivityLogDoc } from "./topLevelCollectionWrites";
export {
  voidUpdateUsersDoc,
  voidSetUsersDocMerge,
  voidUpdateUserPresence,
  voidBatchRepointCompanyOwnerIds,
  setUsersUidDocRoleMerge,
  setAppSettingsAdminConfigSuperEmailsMerge,
  updateUsersDocAwait,
} from "./systemUserFirestore";
export { setGoogleDriveUserTokenMerge } from "./oauthNestedWrites";
