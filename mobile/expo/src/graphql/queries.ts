/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

import * as APITypes from "../API";
type GeneratedQuery<InputType, OutputType> = string & {
  __generatedQueryInput: InputType;
  __generatedQueryOutput: OutputType;
};

export const getLogDetail = /* GraphQL */ `query GetLogDetail($id: ID!) {
  getLogDetail(id: $id) {
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
` as GeneratedQuery<
  APITypes.GetLogDetailQueryVariables,
  APITypes.GetLogDetailQuery
>;
export const listLogDetails = /* GraphQL */ `query ListLogDetails(
  $filter: ModelLogDetailFilterInput
  $limit: Int
  $nextToken: String
) {
  listLogDetails(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
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
    nextToken
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListLogDetailsQueryVariables,
  APITypes.ListLogDetailsQuery
>;
export const getMagicStudioSettings = /* GraphQL */ `query GetMagicStudioSettings($id: ID!) {
  getMagicStudioSettings(id: $id) {
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
` as GeneratedQuery<
  APITypes.GetMagicStudioSettingsQueryVariables,
  APITypes.GetMagicStudioSettingsQuery
>;
export const listMagicStudioSettings = /* GraphQL */ `query ListMagicStudioSettings(
  $filter: ModelMagicStudioSettingsFilterInput
  $limit: Int
  $nextToken: String
) {
  listMagicStudioSettings(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
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
    nextToken
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListMagicStudioSettingsQueryVariables,
  APITypes.ListMagicStudioSettingsQuery
>;
export const getUserSettings = /* GraphQL */ `query GetUserSettings($id: ID!) {
  getUserSettings(id: $id) {
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
` as GeneratedQuery<
  APITypes.GetUserSettingsQueryVariables,
  APITypes.GetUserSettingsQuery
>;
export const listUserSettings = /* GraphQL */ `query ListUserSettings(
  $filter: ModelUserSettingsFilterInput
  $limit: Int
  $nextToken: String
) {
  listUserSettings(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
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
    nextToken
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListUserSettingsQueryVariables,
  APITypes.ListUserSettingsQuery
>;
