/* tslint:disable */
/* eslint-disable */
//  This file was automatically generated and should not be edited.

export type CreateLogDetailInput = {
  id?: string | null,
  deviceuuid?: string | null,
  prompt?: string | null,
  imagefullpath?: string | null,
  deviceos?: string | null,
  actionname?: string | null,
  creationdate?: string | null,
  elapsedtime?: number | null,
};

export type ModelLogDetailConditionInput = {
  deviceuuid?: ModelStringInput | null,
  prompt?: ModelStringInput | null,
  imagefullpath?: ModelStringInput | null,
  deviceos?: ModelStringInput | null,
  actionname?: ModelStringInput | null,
  creationdate?: ModelStringInput | null,
  elapsedtime?: ModelIntInput | null,
  and?: Array< ModelLogDetailConditionInput | null > | null,
  or?: Array< ModelLogDetailConditionInput | null > | null,
  not?: ModelLogDetailConditionInput | null,
  createdAt?: ModelStringInput | null,
  updatedAt?: ModelStringInput | null,
};

export type ModelStringInput = {
  ne?: string | null,
  eq?: string | null,
  le?: string | null,
  lt?: string | null,
  ge?: string | null,
  gt?: string | null,
  contains?: string | null,
  notContains?: string | null,
  between?: Array< string | null > | null,
  beginsWith?: string | null,
  attributeExists?: boolean | null,
  attributeType?: ModelAttributeTypes | null,
  size?: ModelSizeInput | null,
};

export enum ModelAttributeTypes {
  binary = "binary",
  binarySet = "binarySet",
  bool = "bool",
  list = "list",
  map = "map",
  number = "number",
  numberSet = "numberSet",
  string = "string",
  stringSet = "stringSet",
  _null = "_null",
}


export type ModelSizeInput = {
  ne?: number | null,
  eq?: number | null,
  le?: number | null,
  lt?: number | null,
  ge?: number | null,
  gt?: number | null,
  between?: Array< number | null > | null,
};

export type ModelIntInput = {
  ne?: number | null,
  eq?: number | null,
  le?: number | null,
  lt?: number | null,
  ge?: number | null,
  gt?: number | null,
  between?: Array< number | null > | null,
  attributeExists?: boolean | null,
  attributeType?: ModelAttributeTypes | null,
};

export type LogDetail = {
  __typename: "LogDetail",
  id: string,
  deviceuuid?: string | null,
  prompt?: string | null,
  imagefullpath?: string | null,
  deviceos?: string | null,
  actionname?: string | null,
  creationdate?: string | null,
  elapsedtime?: number | null,
  createdAt: string,
  updatedAt: string,
};

export type UpdateLogDetailInput = {
  id: string,
  deviceuuid?: string | null,
  prompt?: string | null,
  imagefullpath?: string | null,
  deviceos?: string | null,
  actionname?: string | null,
  creationdate?: string | null,
  elapsedtime?: number | null,
};

export type DeleteLogDetailInput = {
  id: string,
};

export type CreateMagicStudioSettingsInput = {
  id?: string | null,
  dailycredit?: string | null,
  totalcredit?: string | null,
  dailylimit?: string | null,
  workflowtimeout?: string | null,
  showrevenuecat?: boolean | null,
  islogdetail?: boolean | null,
  showretouch?: boolean | null,
  imageformatforscene?: string | null,
  imagequalityforscene?: number | null,
  backgroundforangleimage?: string | null,
  backgroundforscene?: string | null,
  isusingrecorder3dcanvas?: boolean | null,
  recorder3dcanvasduration?: number | null,
  istakesnapshotforretouch?: boolean | null,
  canvassnapshotlib?: string | null,
};

export type ModelMagicStudioSettingsConditionInput = {
  dailycredit?: ModelStringInput | null,
  totalcredit?: ModelStringInput | null,
  dailylimit?: ModelStringInput | null,
  workflowtimeout?: ModelStringInput | null,
  showrevenuecat?: ModelBooleanInput | null,
  islogdetail?: ModelBooleanInput | null,
  showretouch?: ModelBooleanInput | null,
  imageformatforscene?: ModelStringInput | null,
  imagequalityforscene?: ModelIntInput | null,
  backgroundforangleimage?: ModelStringInput | null,
  backgroundforscene?: ModelStringInput | null,
  isusingrecorder3dcanvas?: ModelBooleanInput | null,
  recorder3dcanvasduration?: ModelIntInput | null,
  istakesnapshotforretouch?: ModelBooleanInput | null,
  canvassnapshotlib?: ModelStringInput | null,
  and?: Array< ModelMagicStudioSettingsConditionInput | null > | null,
  or?: Array< ModelMagicStudioSettingsConditionInput | null > | null,
  not?: ModelMagicStudioSettingsConditionInput | null,
  createdAt?: ModelStringInput | null,
  updatedAt?: ModelStringInput | null,
};

export type ModelBooleanInput = {
  ne?: boolean | null,
  eq?: boolean | null,
  attributeExists?: boolean | null,
  attributeType?: ModelAttributeTypes | null,
};

export type MagicStudioSettings = {
  __typename: "MagicStudioSettings",
  id: string,
  dailycredit?: string | null,
  totalcredit?: string | null,
  dailylimit?: string | null,
  workflowtimeout?: string | null,
  showrevenuecat?: boolean | null,
  islogdetail?: boolean | null,
  showretouch?: boolean | null,
  imageformatforscene?: string | null,
  imagequalityforscene?: number | null,
  backgroundforangleimage?: string | null,
  backgroundforscene?: string | null,
  isusingrecorder3dcanvas?: boolean | null,
  recorder3dcanvasduration?: number | null,
  istakesnapshotforretouch?: boolean | null,
  canvassnapshotlib?: string | null,
  createdAt: string,
  updatedAt: string,
};

export type UpdateMagicStudioSettingsInput = {
  id: string,
  dailycredit?: string | null,
  totalcredit?: string | null,
  dailylimit?: string | null,
  workflowtimeout?: string | null,
  showrevenuecat?: boolean | null,
  islogdetail?: boolean | null,
  showretouch?: boolean | null,
  imageformatforscene?: string | null,
  imagequalityforscene?: number | null,
  backgroundforangleimage?: string | null,
  backgroundforscene?: string | null,
  isusingrecorder3dcanvas?: boolean | null,
  recorder3dcanvasduration?: number | null,
  istakesnapshotforretouch?: boolean | null,
  canvassnapshotlib?: string | null,
};

export type DeleteMagicStudioSettingsInput = {
  id: string,
};

export type CreateUserSettingsInput = {
  id?: string | null,
  deviceuuid?: string | null,
  dailycredit?: string | null,
  totalcredit?: string | null,
  createddate?: string | null,
  updateddate?: string | null,
  email?: string | null,
  enable?: boolean | null,
  isadmin?: boolean | null,
  phonenumber?: string | null,
  deviceos?: string | null,
};

export type ModelUserSettingsConditionInput = {
  deviceuuid?: ModelStringInput | null,
  dailycredit?: ModelStringInput | null,
  totalcredit?: ModelStringInput | null,
  createddate?: ModelStringInput | null,
  updateddate?: ModelStringInput | null,
  email?: ModelStringInput | null,
  enable?: ModelBooleanInput | null,
  isadmin?: ModelBooleanInput | null,
  phonenumber?: ModelStringInput | null,
  deviceos?: ModelStringInput | null,
  and?: Array< ModelUserSettingsConditionInput | null > | null,
  or?: Array< ModelUserSettingsConditionInput | null > | null,
  not?: ModelUserSettingsConditionInput | null,
  createdAt?: ModelStringInput | null,
  updatedAt?: ModelStringInput | null,
};

export type UserSettings = {
  __typename: "UserSettings",
  id: string,
  deviceuuid?: string | null,
  dailycredit?: string | null,
  totalcredit?: string | null,
  createddate?: string | null,
  updateddate?: string | null,
  email?: string | null,
  enable?: boolean | null,
  isadmin?: boolean | null,
  phonenumber?: string | null,
  deviceos?: string | null,
  createdAt: string,
  updatedAt: string,
};

export type UpdateUserSettingsInput = {
  id: string,
  deviceuuid?: string | null,
  dailycredit?: string | null,
  totalcredit?: string | null,
  createddate?: string | null,
  updateddate?: string | null,
  email?: string | null,
  enable?: boolean | null,
  isadmin?: boolean | null,
  phonenumber?: string | null,
  deviceos?: string | null,
};

export type DeleteUserSettingsInput = {
  id: string,
};

export type ModelLogDetailFilterInput = {
  id?: ModelIDInput | null,
  deviceuuid?: ModelStringInput | null,
  prompt?: ModelStringInput | null,
  imagefullpath?: ModelStringInput | null,
  deviceos?: ModelStringInput | null,
  actionname?: ModelStringInput | null,
  creationdate?: ModelStringInput | null,
  elapsedtime?: ModelIntInput | null,
  createdAt?: ModelStringInput | null,
  updatedAt?: ModelStringInput | null,
  and?: Array< ModelLogDetailFilterInput | null > | null,
  or?: Array< ModelLogDetailFilterInput | null > | null,
  not?: ModelLogDetailFilterInput | null,
};

export type ModelIDInput = {
  ne?: string | null,
  eq?: string | null,
  le?: string | null,
  lt?: string | null,
  ge?: string | null,
  gt?: string | null,
  contains?: string | null,
  notContains?: string | null,
  between?: Array< string | null > | null,
  beginsWith?: string | null,
  attributeExists?: boolean | null,
  attributeType?: ModelAttributeTypes | null,
  size?: ModelSizeInput | null,
};

export type ModelLogDetailConnection = {
  __typename: "ModelLogDetailConnection",
  items:  Array<LogDetail | null >,
  nextToken?: string | null,
};

export type ModelMagicStudioSettingsFilterInput = {
  id?: ModelIDInput | null,
  dailycredit?: ModelStringInput | null,
  totalcredit?: ModelStringInput | null,
  dailylimit?: ModelStringInput | null,
  workflowtimeout?: ModelStringInput | null,
  showrevenuecat?: ModelBooleanInput | null,
  islogdetail?: ModelBooleanInput | null,
  showretouch?: ModelBooleanInput | null,
  imageformatforscene?: ModelStringInput | null,
  imagequalityforscene?: ModelIntInput | null,
  backgroundforangleimage?: ModelStringInput | null,
  backgroundforscene?: ModelStringInput | null,
  isusingrecorder3dcanvas?: ModelBooleanInput | null,
  recorder3dcanvasduration?: ModelIntInput | null,
  istakesnapshotforretouch?: ModelBooleanInput | null,
  canvassnapshotlib?: ModelStringInput | null,
  createdAt?: ModelStringInput | null,
  updatedAt?: ModelStringInput | null,
  and?: Array< ModelMagicStudioSettingsFilterInput | null > | null,
  or?: Array< ModelMagicStudioSettingsFilterInput | null > | null,
  not?: ModelMagicStudioSettingsFilterInput | null,
};

export type ModelMagicStudioSettingsConnection = {
  __typename: "ModelMagicStudioSettingsConnection",
  items:  Array<MagicStudioSettings | null >,
  nextToken?: string | null,
};

export type ModelUserSettingsFilterInput = {
  id?: ModelIDInput | null,
  deviceuuid?: ModelStringInput | null,
  dailycredit?: ModelStringInput | null,
  totalcredit?: ModelStringInput | null,
  createddate?: ModelStringInput | null,
  updateddate?: ModelStringInput | null,
  email?: ModelStringInput | null,
  enable?: ModelBooleanInput | null,
  isadmin?: ModelBooleanInput | null,
  phonenumber?: ModelStringInput | null,
  deviceos?: ModelStringInput | null,
  createdAt?: ModelStringInput | null,
  updatedAt?: ModelStringInput | null,
  and?: Array< ModelUserSettingsFilterInput | null > | null,
  or?: Array< ModelUserSettingsFilterInput | null > | null,
  not?: ModelUserSettingsFilterInput | null,
};

export type ModelUserSettingsConnection = {
  __typename: "ModelUserSettingsConnection",
  items:  Array<UserSettings | null >,
  nextToken?: string | null,
};

export type ModelSubscriptionLogDetailFilterInput = {
  id?: ModelSubscriptionIDInput | null,
  deviceuuid?: ModelSubscriptionStringInput | null,
  prompt?: ModelSubscriptionStringInput | null,
  imagefullpath?: ModelSubscriptionStringInput | null,
  deviceos?: ModelSubscriptionStringInput | null,
  actionname?: ModelSubscriptionStringInput | null,
  creationdate?: ModelSubscriptionStringInput | null,
  elapsedtime?: ModelSubscriptionIntInput | null,
  createdAt?: ModelSubscriptionStringInput | null,
  updatedAt?: ModelSubscriptionStringInput | null,
  and?: Array< ModelSubscriptionLogDetailFilterInput | null > | null,
  or?: Array< ModelSubscriptionLogDetailFilterInput | null > | null,
};

export type ModelSubscriptionIDInput = {
  ne?: string | null,
  eq?: string | null,
  le?: string | null,
  lt?: string | null,
  ge?: string | null,
  gt?: string | null,
  contains?: string | null,
  notContains?: string | null,
  between?: Array< string | null > | null,
  beginsWith?: string | null,
  in?: Array< string | null > | null,
  notIn?: Array< string | null > | null,
};

export type ModelSubscriptionStringInput = {
  ne?: string | null,
  eq?: string | null,
  le?: string | null,
  lt?: string | null,
  ge?: string | null,
  gt?: string | null,
  contains?: string | null,
  notContains?: string | null,
  between?: Array< string | null > | null,
  beginsWith?: string | null,
  in?: Array< string | null > | null,
  notIn?: Array< string | null > | null,
};

export type ModelSubscriptionIntInput = {
  ne?: number | null,
  eq?: number | null,
  le?: number | null,
  lt?: number | null,
  ge?: number | null,
  gt?: number | null,
  between?: Array< number | null > | null,
  in?: Array< number | null > | null,
  notIn?: Array< number | null > | null,
};

export type ModelSubscriptionMagicStudioSettingsFilterInput = {
  id?: ModelSubscriptionIDInput | null,
  dailycredit?: ModelSubscriptionStringInput | null,
  totalcredit?: ModelSubscriptionStringInput | null,
  dailylimit?: ModelSubscriptionStringInput | null,
  workflowtimeout?: ModelSubscriptionStringInput | null,
  showrevenuecat?: ModelSubscriptionBooleanInput | null,
  islogdetail?: ModelSubscriptionBooleanInput | null,
  showretouch?: ModelSubscriptionBooleanInput | null,
  imageformatforscene?: ModelSubscriptionStringInput | null,
  imagequalityforscene?: ModelSubscriptionIntInput | null,
  backgroundforangleimage?: ModelSubscriptionStringInput | null,
  backgroundforscene?: ModelSubscriptionStringInput | null,
  isusingrecorder3dcanvas?: ModelSubscriptionBooleanInput | null,
  recorder3dcanvasduration?: ModelSubscriptionIntInput | null,
  istakesnapshotforretouch?: ModelSubscriptionBooleanInput | null,
  canvassnapshotlib?: ModelSubscriptionStringInput | null,
  createdAt?: ModelSubscriptionStringInput | null,
  updatedAt?: ModelSubscriptionStringInput | null,
  and?: Array< ModelSubscriptionMagicStudioSettingsFilterInput | null > | null,
  or?: Array< ModelSubscriptionMagicStudioSettingsFilterInput | null > | null,
};

export type ModelSubscriptionBooleanInput = {
  ne?: boolean | null,
  eq?: boolean | null,
};

export type ModelSubscriptionUserSettingsFilterInput = {
  id?: ModelSubscriptionIDInput | null,
  deviceuuid?: ModelSubscriptionStringInput | null,
  dailycredit?: ModelSubscriptionStringInput | null,
  totalcredit?: ModelSubscriptionStringInput | null,
  createddate?: ModelSubscriptionStringInput | null,
  updateddate?: ModelSubscriptionStringInput | null,
  email?: ModelSubscriptionStringInput | null,
  enable?: ModelSubscriptionBooleanInput | null,
  isadmin?: ModelSubscriptionBooleanInput | null,
  phonenumber?: ModelSubscriptionStringInput | null,
  deviceos?: ModelSubscriptionStringInput | null,
  createdAt?: ModelSubscriptionStringInput | null,
  updatedAt?: ModelSubscriptionStringInput | null,
  and?: Array< ModelSubscriptionUserSettingsFilterInput | null > | null,
  or?: Array< ModelSubscriptionUserSettingsFilterInput | null > | null,
};

export type CreateLogDetailMutationVariables = {
  input: CreateLogDetailInput,
  condition?: ModelLogDetailConditionInput | null,
};

export type CreateLogDetailMutation = {
  createLogDetail?:  {
    __typename: "LogDetail",
    id: string,
    deviceuuid?: string | null,
    prompt?: string | null,
    imagefullpath?: string | null,
    deviceos?: string | null,
    actionname?: string | null,
    creationdate?: string | null,
    elapsedtime?: number | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type UpdateLogDetailMutationVariables = {
  input: UpdateLogDetailInput,
  condition?: ModelLogDetailConditionInput | null,
};

export type UpdateLogDetailMutation = {
  updateLogDetail?:  {
    __typename: "LogDetail",
    id: string,
    deviceuuid?: string | null,
    prompt?: string | null,
    imagefullpath?: string | null,
    deviceos?: string | null,
    actionname?: string | null,
    creationdate?: string | null,
    elapsedtime?: number | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type DeleteLogDetailMutationVariables = {
  input: DeleteLogDetailInput,
  condition?: ModelLogDetailConditionInput | null,
};

export type DeleteLogDetailMutation = {
  deleteLogDetail?:  {
    __typename: "LogDetail",
    id: string,
    deviceuuid?: string | null,
    prompt?: string | null,
    imagefullpath?: string | null,
    deviceos?: string | null,
    actionname?: string | null,
    creationdate?: string | null,
    elapsedtime?: number | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type CreateMagicStudioSettingsMutationVariables = {
  input: CreateMagicStudioSettingsInput,
  condition?: ModelMagicStudioSettingsConditionInput | null,
};

export type CreateMagicStudioSettingsMutation = {
  createMagicStudioSettings?:  {
    __typename: "MagicStudioSettings",
    id: string,
    dailycredit?: string | null,
    totalcredit?: string | null,
    dailylimit?: string | null,
    workflowtimeout?: string | null,
    showrevenuecat?: boolean | null,
    islogdetail?: boolean | null,
    showretouch?: boolean | null,
    imageformatforscene?: string | null,
    imagequalityforscene?: number | null,
    backgroundforangleimage?: string | null,
    backgroundforscene?: string | null,
    isusingrecorder3dcanvas?: boolean | null,
    recorder3dcanvasduration?: number | null,
    istakesnapshotforretouch?: boolean | null,
    canvassnapshotlib?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type UpdateMagicStudioSettingsMutationVariables = {
  input: UpdateMagicStudioSettingsInput,
  condition?: ModelMagicStudioSettingsConditionInput | null,
};

export type UpdateMagicStudioSettingsMutation = {
  updateMagicStudioSettings?:  {
    __typename: "MagicStudioSettings",
    id: string,
    dailycredit?: string | null,
    totalcredit?: string | null,
    dailylimit?: string | null,
    workflowtimeout?: string | null,
    showrevenuecat?: boolean | null,
    islogdetail?: boolean | null,
    showretouch?: boolean | null,
    imageformatforscene?: string | null,
    imagequalityforscene?: number | null,
    backgroundforangleimage?: string | null,
    backgroundforscene?: string | null,
    isusingrecorder3dcanvas?: boolean | null,
    recorder3dcanvasduration?: number | null,
    istakesnapshotforretouch?: boolean | null,
    canvassnapshotlib?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type DeleteMagicStudioSettingsMutationVariables = {
  input: DeleteMagicStudioSettingsInput,
  condition?: ModelMagicStudioSettingsConditionInput | null,
};

export type DeleteMagicStudioSettingsMutation = {
  deleteMagicStudioSettings?:  {
    __typename: "MagicStudioSettings",
    id: string,
    dailycredit?: string | null,
    totalcredit?: string | null,
    dailylimit?: string | null,
    workflowtimeout?: string | null,
    showrevenuecat?: boolean | null,
    islogdetail?: boolean | null,
    showretouch?: boolean | null,
    imageformatforscene?: string | null,
    imagequalityforscene?: number | null,
    backgroundforangleimage?: string | null,
    backgroundforscene?: string | null,
    isusingrecorder3dcanvas?: boolean | null,
    recorder3dcanvasduration?: number | null,
    istakesnapshotforretouch?: boolean | null,
    canvassnapshotlib?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type CreateUserSettingsMutationVariables = {
  input: CreateUserSettingsInput,
  condition?: ModelUserSettingsConditionInput | null,
};

export type CreateUserSettingsMutation = {
  createUserSettings?:  {
    __typename: "UserSettings",
    id: string,
    deviceuuid?: string | null,
    dailycredit?: string | null,
    totalcredit?: string | null,
    createddate?: string | null,
    updateddate?: string | null,
    email?: string | null,
    enable?: boolean | null,
    isadmin?: boolean | null,
    phonenumber?: string | null,
    deviceos?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type UpdateUserSettingsMutationVariables = {
  input: UpdateUserSettingsInput,
  condition?: ModelUserSettingsConditionInput | null,
};

export type UpdateUserSettingsMutation = {
  updateUserSettings?:  {
    __typename: "UserSettings",
    id: string,
    deviceuuid?: string | null,
    dailycredit?: string | null,
    totalcredit?: string | null,
    createddate?: string | null,
    updateddate?: string | null,
    email?: string | null,
    enable?: boolean | null,
    isadmin?: boolean | null,
    phonenumber?: string | null,
    deviceos?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type DeleteUserSettingsMutationVariables = {
  input: DeleteUserSettingsInput,
  condition?: ModelUserSettingsConditionInput | null,
};

export type DeleteUserSettingsMutation = {
  deleteUserSettings?:  {
    __typename: "UserSettings",
    id: string,
    deviceuuid?: string | null,
    dailycredit?: string | null,
    totalcredit?: string | null,
    createddate?: string | null,
    updateddate?: string | null,
    email?: string | null,
    enable?: boolean | null,
    isadmin?: boolean | null,
    phonenumber?: string | null,
    deviceos?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type GetLogDetailQueryVariables = {
  id: string,
};

export type GetLogDetailQuery = {
  getLogDetail?:  {
    __typename: "LogDetail",
    id: string,
    deviceuuid?: string | null,
    prompt?: string | null,
    imagefullpath?: string | null,
    deviceos?: string | null,
    actionname?: string | null,
    creationdate?: string | null,
    elapsedtime?: number | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type ListLogDetailsQueryVariables = {
  filter?: ModelLogDetailFilterInput | null,
  limit?: number | null,
  nextToken?: string | null,
};

export type ListLogDetailsQuery = {
  listLogDetails?:  {
    __typename: "ModelLogDetailConnection",
    items:  Array< {
      __typename: "LogDetail",
      id: string,
      deviceuuid?: string | null,
      prompt?: string | null,
      imagefullpath?: string | null,
      deviceos?: string | null,
      actionname?: string | null,
      creationdate?: string | null,
      elapsedtime?: number | null,
      createdAt: string,
      updatedAt: string,
    } | null >,
    nextToken?: string | null,
  } | null,
};

export type GetMagicStudioSettingsQueryVariables = {
  id: string,
};

export type GetMagicStudioSettingsQuery = {
  getMagicStudioSettings?:  {
    __typename: "MagicStudioSettings",
    id: string,
    dailycredit?: string | null,
    totalcredit?: string | null,
    dailylimit?: string | null,
    workflowtimeout?: string | null,
    showrevenuecat?: boolean | null,
    islogdetail?: boolean | null,
    showretouch?: boolean | null,
    imageformatforscene?: string | null,
    imagequalityforscene?: number | null,
    backgroundforangleimage?: string | null,
    backgroundforscene?: string | null,
    isusingrecorder3dcanvas?: boolean | null,
    recorder3dcanvasduration?: number | null,
    istakesnapshotforretouch?: boolean | null,
    canvassnapshotlib?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type ListMagicStudioSettingsQueryVariables = {
  filter?: ModelMagicStudioSettingsFilterInput | null,
  limit?: number | null,
  nextToken?: string | null,
};

export type ListMagicStudioSettingsQuery = {
  listMagicStudioSettings?:  {
    __typename: "ModelMagicStudioSettingsConnection",
    items:  Array< {
      __typename: "MagicStudioSettings",
      id: string,
      dailycredit?: string | null,
      totalcredit?: string | null,
      dailylimit?: string | null,
      workflowtimeout?: string | null,
      showrevenuecat?: boolean | null,
      islogdetail?: boolean | null,
      showretouch?: boolean | null,
      imageformatforscene?: string | null,
      imagequalityforscene?: number | null,
      backgroundforangleimage?: string | null,
      backgroundforscene?: string | null,
      isusingrecorder3dcanvas?: boolean | null,
      recorder3dcanvasduration?: number | null,
      istakesnapshotforretouch?: boolean | null,
      canvassnapshotlib?: string | null,
      createdAt: string,
      updatedAt: string,
    } | null >,
    nextToken?: string | null,
  } | null,
};

export type GetUserSettingsQueryVariables = {
  id: string,
};

export type GetUserSettingsQuery = {
  getUserSettings?:  {
    __typename: "UserSettings",
    id: string,
    deviceuuid?: string | null,
    dailycredit?: string | null,
    totalcredit?: string | null,
    createddate?: string | null,
    updateddate?: string | null,
    email?: string | null,
    enable?: boolean | null,
    isadmin?: boolean | null,
    phonenumber?: string | null,
    deviceos?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type ListUserSettingsQueryVariables = {
  filter?: ModelUserSettingsFilterInput | null,
  limit?: number | null,
  nextToken?: string | null,
};

export type ListUserSettingsQuery = {
  listUserSettings?:  {
    __typename: "ModelUserSettingsConnection",
    items:  Array< {
      __typename: "UserSettings",
      id: string,
      deviceuuid?: string | null,
      dailycredit?: string | null,
      totalcredit?: string | null,
      createddate?: string | null,
      updateddate?: string | null,
      email?: string | null,
      enable?: boolean | null,
      isadmin?: boolean | null,
      phonenumber?: string | null,
      deviceos?: string | null,
      createdAt: string,
      updatedAt: string,
    } | null >,
    nextToken?: string | null,
  } | null,
};

export type OnCreateLogDetailSubscriptionVariables = {
  filter?: ModelSubscriptionLogDetailFilterInput | null,
};

export type OnCreateLogDetailSubscription = {
  onCreateLogDetail?:  {
    __typename: "LogDetail",
    id: string,
    deviceuuid?: string | null,
    prompt?: string | null,
    imagefullpath?: string | null,
    deviceos?: string | null,
    actionname?: string | null,
    creationdate?: string | null,
    elapsedtime?: number | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type OnUpdateLogDetailSubscriptionVariables = {
  filter?: ModelSubscriptionLogDetailFilterInput | null,
};

export type OnUpdateLogDetailSubscription = {
  onUpdateLogDetail?:  {
    __typename: "LogDetail",
    id: string,
    deviceuuid?: string | null,
    prompt?: string | null,
    imagefullpath?: string | null,
    deviceos?: string | null,
    actionname?: string | null,
    creationdate?: string | null,
    elapsedtime?: number | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type OnDeleteLogDetailSubscriptionVariables = {
  filter?: ModelSubscriptionLogDetailFilterInput | null,
};

export type OnDeleteLogDetailSubscription = {
  onDeleteLogDetail?:  {
    __typename: "LogDetail",
    id: string,
    deviceuuid?: string | null,
    prompt?: string | null,
    imagefullpath?: string | null,
    deviceos?: string | null,
    actionname?: string | null,
    creationdate?: string | null,
    elapsedtime?: number | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type OnCreateMagicStudioSettingsSubscriptionVariables = {
  filter?: ModelSubscriptionMagicStudioSettingsFilterInput | null,
};

export type OnCreateMagicStudioSettingsSubscription = {
  onCreateMagicStudioSettings?:  {
    __typename: "MagicStudioSettings",
    id: string,
    dailycredit?: string | null,
    totalcredit?: string | null,
    dailylimit?: string | null,
    workflowtimeout?: string | null,
    showrevenuecat?: boolean | null,
    islogdetail?: boolean | null,
    showretouch?: boolean | null,
    imageformatforscene?: string | null,
    imagequalityforscene?: number | null,
    backgroundforangleimage?: string | null,
    backgroundforscene?: string | null,
    isusingrecorder3dcanvas?: boolean | null,
    recorder3dcanvasduration?: number | null,
    istakesnapshotforretouch?: boolean | null,
    canvassnapshotlib?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type OnUpdateMagicStudioSettingsSubscriptionVariables = {
  filter?: ModelSubscriptionMagicStudioSettingsFilterInput | null,
};

export type OnUpdateMagicStudioSettingsSubscription = {
  onUpdateMagicStudioSettings?:  {
    __typename: "MagicStudioSettings",
    id: string,
    dailycredit?: string | null,
    totalcredit?: string | null,
    dailylimit?: string | null,
    workflowtimeout?: string | null,
    showrevenuecat?: boolean | null,
    islogdetail?: boolean | null,
    showretouch?: boolean | null,
    imageformatforscene?: string | null,
    imagequalityforscene?: number | null,
    backgroundforangleimage?: string | null,
    backgroundforscene?: string | null,
    isusingrecorder3dcanvas?: boolean | null,
    recorder3dcanvasduration?: number | null,
    istakesnapshotforretouch?: boolean | null,
    canvassnapshotlib?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type OnDeleteMagicStudioSettingsSubscriptionVariables = {
  filter?: ModelSubscriptionMagicStudioSettingsFilterInput | null,
};

export type OnDeleteMagicStudioSettingsSubscription = {
  onDeleteMagicStudioSettings?:  {
    __typename: "MagicStudioSettings",
    id: string,
    dailycredit?: string | null,
    totalcredit?: string | null,
    dailylimit?: string | null,
    workflowtimeout?: string | null,
    showrevenuecat?: boolean | null,
    islogdetail?: boolean | null,
    showretouch?: boolean | null,
    imageformatforscene?: string | null,
    imagequalityforscene?: number | null,
    backgroundforangleimage?: string | null,
    backgroundforscene?: string | null,
    isusingrecorder3dcanvas?: boolean | null,
    recorder3dcanvasduration?: number | null,
    istakesnapshotforretouch?: boolean | null,
    canvassnapshotlib?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type OnCreateUserSettingsSubscriptionVariables = {
  filter?: ModelSubscriptionUserSettingsFilterInput | null,
};

export type OnCreateUserSettingsSubscription = {
  onCreateUserSettings?:  {
    __typename: "UserSettings",
    id: string,
    deviceuuid?: string | null,
    dailycredit?: string | null,
    totalcredit?: string | null,
    createddate?: string | null,
    updateddate?: string | null,
    email?: string | null,
    enable?: boolean | null,
    isadmin?: boolean | null,
    phonenumber?: string | null,
    deviceos?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type OnUpdateUserSettingsSubscriptionVariables = {
  filter?: ModelSubscriptionUserSettingsFilterInput | null,
};

export type OnUpdateUserSettingsSubscription = {
  onUpdateUserSettings?:  {
    __typename: "UserSettings",
    id: string,
    deviceuuid?: string | null,
    dailycredit?: string | null,
    totalcredit?: string | null,
    createddate?: string | null,
    updateddate?: string | null,
    email?: string | null,
    enable?: boolean | null,
    isadmin?: boolean | null,
    phonenumber?: string | null,
    deviceos?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};

export type OnDeleteUserSettingsSubscriptionVariables = {
  filter?: ModelSubscriptionUserSettingsFilterInput | null,
};

export type OnDeleteUserSettingsSubscription = {
  onDeleteUserSettings?:  {
    __typename: "UserSettings",
    id: string,
    deviceuuid?: string | null,
    dailycredit?: string | null,
    totalcredit?: string | null,
    createddate?: string | null,
    updateddate?: string | null,
    email?: string | null,
    enable?: boolean | null,
    isadmin?: boolean | null,
    phonenumber?: string | null,
    deviceos?: string | null,
    createdAt: string,
    updatedAt: string,
  } | null,
};
