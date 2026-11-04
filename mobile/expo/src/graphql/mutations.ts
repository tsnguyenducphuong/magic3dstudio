/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

import * as APITypes from "../API";
type GeneratedMutation<InputType, OutputType> = string & {
  __generatedMutationInput: InputType;
  __generatedMutationOutput: OutputType;
};

export const createLogDetail = /* GraphQL */ `mutation CreateLogDetail(
  $input: CreateLogDetailInput!
  $condition: ModelLogDetailConditionInput
) {
  createLogDetail(input: $input, condition: $condition) {
    id
    deviceuuid
    prompt
    imagefullpath
    deviceos
    actionname
    creationdate
    elapsedtime
    createdAt
    updatedAt
    __typename
  }
}
` as GeneratedMutation<
  APITypes.CreateLogDetailMutationVariables,
  APITypes.CreateLogDetailMutation
>;
export const updateLogDetail = /* GraphQL */ `mutation UpdateLogDetail(
  $input: UpdateLogDetailInput!
  $condition: ModelLogDetailConditionInput
) {
  updateLogDetail(input: $input, condition: $condition) {
    id
    deviceuuid
    prompt
    imagefullpath
    deviceos
    actionname
    creationdate
    elapsedtime
    createdAt
    updatedAt
    __typename
  }
}
` as GeneratedMutation<
  APITypes.UpdateLogDetailMutationVariables,
  APITypes.UpdateLogDetailMutation
>;
export const deleteLogDetail = /* GraphQL */ `mutation DeleteLogDetail(
  $input: DeleteLogDetailInput!
  $condition: ModelLogDetailConditionInput
) {
  deleteLogDetail(input: $input, condition: $condition) {
    id
    deviceuuid
    prompt
    imagefullpath
    deviceos
    actionname
    creationdate
    elapsedtime
    createdAt
    updatedAt
    __typename
  }
}
` as GeneratedMutation<
  APITypes.DeleteLogDetailMutationVariables,
  APITypes.DeleteLogDetailMutation
>;
export const createMagicStudioSettings = /* GraphQL */ `mutation CreateMagicStudioSettings(
  $input: CreateMagicStudioSettingsInput!
  $condition: ModelMagicStudioSettingsConditionInput
) {
  createMagicStudioSettings(input: $input, condition: $condition) {
    id
    dailycredit
    totalcredit
    dailylimit
    workflowtimeout
    showrevenuecat
    islogdetail
    showretouch
    imageformatforscene
    imagequalityforscene
    backgroundforangleimage
    backgroundforscene
    isusingrecorder3dcanvas
    recorder3dcanvasduration
    istakesnapshotforretouch
    canvassnapshotlib
    createdAt
    updatedAt
    __typename
  }
}
` as GeneratedMutation<
  APITypes.CreateMagicStudioSettingsMutationVariables,
  APITypes.CreateMagicStudioSettingsMutation
>;
export const updateMagicStudioSettings = /* GraphQL */ `mutation UpdateMagicStudioSettings(
  $input: UpdateMagicStudioSettingsInput!
  $condition: ModelMagicStudioSettingsConditionInput
) {
  updateMagicStudioSettings(input: $input, condition: $condition) {
    id
    dailycredit
    totalcredit
    dailylimit
    workflowtimeout
    showrevenuecat
    islogdetail
    showretouch
    imageformatforscene
    imagequalityforscene
    backgroundforangleimage
    backgroundforscene
    isusingrecorder3dcanvas
    recorder3dcanvasduration
    istakesnapshotforretouch
    canvassnapshotlib
    createdAt
    updatedAt
    __typename
  }
}
` as GeneratedMutation<
  APITypes.UpdateMagicStudioSettingsMutationVariables,
  APITypes.UpdateMagicStudioSettingsMutation
>;
export const deleteMagicStudioSettings = /* GraphQL */ `mutation DeleteMagicStudioSettings(
  $input: DeleteMagicStudioSettingsInput!
  $condition: ModelMagicStudioSettingsConditionInput
) {
  deleteMagicStudioSettings(input: $input, condition: $condition) {
    id
    dailycredit
    totalcredit
    dailylimit
    workflowtimeout
    showrevenuecat
    islogdetail
    showretouch
    imageformatforscene
    imagequalityforscene
    backgroundforangleimage
    backgroundforscene
    isusingrecorder3dcanvas
    recorder3dcanvasduration
    istakesnapshotforretouch
    canvassnapshotlib
    createdAt
    updatedAt
    __typename
  }
}
` as GeneratedMutation<
  APITypes.DeleteMagicStudioSettingsMutationVariables,
  APITypes.DeleteMagicStudioSettingsMutation
>;
export const createUserSettings = /* GraphQL */ `mutation CreateUserSettings(
  $input: CreateUserSettingsInput!
  $condition: ModelUserSettingsConditionInput
) {
  createUserSettings(input: $input, condition: $condition) {
    id
    deviceuuid
    dailycredit
    totalcredit
    createddate
    updateddate
    email
    enable
    isadmin
    phonenumber
    deviceos
    createdAt
    updatedAt
    __typename
  }
}
` as GeneratedMutation<
  APITypes.CreateUserSettingsMutationVariables,
  APITypes.CreateUserSettingsMutation
>;
export const updateUserSettings = /* GraphQL */ `mutation UpdateUserSettings(
  $input: UpdateUserSettingsInput!
  $condition: ModelUserSettingsConditionInput
) {
  updateUserSettings(input: $input, condition: $condition) {
    id
    deviceuuid
    dailycredit
    totalcredit
    createddate
    updateddate
    email
    enable
    isadmin
    phonenumber
    deviceos
    createdAt
    updatedAt
    __typename
  }
}
` as GeneratedMutation<
  APITypes.UpdateUserSettingsMutationVariables,
  APITypes.UpdateUserSettingsMutation
>;
export const deleteUserSettings = /* GraphQL */ `mutation DeleteUserSettings(
  $input: DeleteUserSettingsInput!
  $condition: ModelUserSettingsConditionInput
) {
  deleteUserSettings(input: $input, condition: $condition) {
    id
    deviceuuid
    dailycredit
    totalcredit
    createddate
    updateddate
    email
    enable
    isadmin
    phonenumber
    deviceos
    createdAt
    updatedAt
    __typename
  }
}
` as GeneratedMutation<
  APITypes.DeleteUserSettingsMutationVariables,
  APITypes.DeleteUserSettingsMutation
>;
