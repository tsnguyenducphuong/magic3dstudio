/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

import * as APITypes from "../API";
type GeneratedSubscription<InputType, OutputType> = string & {
  __generatedSubscriptionInput: InputType;
  __generatedSubscriptionOutput: OutputType;
};

export const onCreateLogDetail = /* GraphQL */ `subscription OnCreateLogDetail($filter: ModelSubscriptionLogDetailFilterInput) {
  onCreateLogDetail(filter: $filter) {
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
` as GeneratedSubscription<
  APITypes.OnCreateLogDetailSubscriptionVariables,
  APITypes.OnCreateLogDetailSubscription
>;
export const onUpdateLogDetail = /* GraphQL */ `subscription OnUpdateLogDetail($filter: ModelSubscriptionLogDetailFilterInput) {
  onUpdateLogDetail(filter: $filter) {
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
` as GeneratedSubscription<
  APITypes.OnUpdateLogDetailSubscriptionVariables,
  APITypes.OnUpdateLogDetailSubscription
>;
export const onDeleteLogDetail = /* GraphQL */ `subscription OnDeleteLogDetail($filter: ModelSubscriptionLogDetailFilterInput) {
  onDeleteLogDetail(filter: $filter) {
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
` as GeneratedSubscription<
  APITypes.OnDeleteLogDetailSubscriptionVariables,
  APITypes.OnDeleteLogDetailSubscription
>;
export const onCreateMagicStudioSettings = /* GraphQL */ `subscription OnCreateMagicStudioSettings(
  $filter: ModelSubscriptionMagicStudioSettingsFilterInput
) {
  onCreateMagicStudioSettings(filter: $filter) {
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
` as GeneratedSubscription<
  APITypes.OnCreateMagicStudioSettingsSubscriptionVariables,
  APITypes.OnCreateMagicStudioSettingsSubscription
>;
export const onUpdateMagicStudioSettings = /* GraphQL */ `subscription OnUpdateMagicStudioSettings(
  $filter: ModelSubscriptionMagicStudioSettingsFilterInput
) {
  onUpdateMagicStudioSettings(filter: $filter) {
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
` as GeneratedSubscription<
  APITypes.OnUpdateMagicStudioSettingsSubscriptionVariables,
  APITypes.OnUpdateMagicStudioSettingsSubscription
>;
export const onDeleteMagicStudioSettings = /* GraphQL */ `subscription OnDeleteMagicStudioSettings(
  $filter: ModelSubscriptionMagicStudioSettingsFilterInput
) {
  onDeleteMagicStudioSettings(filter: $filter) {
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
` as GeneratedSubscription<
  APITypes.OnDeleteMagicStudioSettingsSubscriptionVariables,
  APITypes.OnDeleteMagicStudioSettingsSubscription
>;
export const onCreateUserSettings = /* GraphQL */ `subscription OnCreateUserSettings(
  $filter: ModelSubscriptionUserSettingsFilterInput
) {
  onCreateUserSettings(filter: $filter) {
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
` as GeneratedSubscription<
  APITypes.OnCreateUserSettingsSubscriptionVariables,
  APITypes.OnCreateUserSettingsSubscription
>;
export const onUpdateUserSettings = /* GraphQL */ `subscription OnUpdateUserSettings(
  $filter: ModelSubscriptionUserSettingsFilterInput
) {
  onUpdateUserSettings(filter: $filter) {
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
` as GeneratedSubscription<
  APITypes.OnUpdateUserSettingsSubscriptionVariables,
  APITypes.OnUpdateUserSettingsSubscription
>;
export const onDeleteUserSettings = /* GraphQL */ `subscription OnDeleteUserSettings(
  $filter: ModelSubscriptionUserSettingsFilterInput
) {
  onDeleteUserSettings(filter: $filter) {
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
` as GeneratedSubscription<
  APITypes.OnDeleteUserSettingsSubscriptionVariables,
  APITypes.OnDeleteUserSettingsSubscription
>;
