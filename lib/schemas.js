'use strict'
const Joi = require('util/joi')

const organizationIdAndName = Joi.object({
  id: Joi.number().required(),
  name: Joi.string().required()
}).required()

const organizationId = Joi.object({
  id: Joi.number().required()
}).required()

exports.emptyObjectSchema = Joi.object({}).required()

exports.paymentMethodEventSchema = Joi.object({
  organization: organizationIdAndName,
  paymentMethodOwner: Joi.object({
    githubId: Joi.number().required(),
    email: Joi.string()
  }).unknown().required()
}).unknown().required().label('paymentMethodEventSchema')

exports.invoicePaymentSchema = Joi.object({
  invoicePaymentHasFailedFor24Hours: Joi.boolean().required(),
  organization: organizationIdAndName,
  paymentMethodOwner: Joi.object({
    githubId: Joi.number().required()
  }).required()
}).unknown().required().label('invoicePaymentSchema')

exports.trialSchema = Joi.object({
  organization: organizationIdAndName
}).unknown().required().label('trialSchema')

exports.subscriptionCreateSchema = Joi.object({
  organization: organizationId
}).unknown().required().label('subscriptionCreateSchema')

exports.subscriptionCreatedSchema = Joi.object({
  organization: organizationId,
  subscription: Joi.object({
    id: Joi.string().required()
  }).unknown().required()
}).unknown().required().label('subscriptionCreatedSchema')

exports.payInvoiceSchema = Joi.object({
  invoice: Joi.object({
    id: Joi.string().required()
  }).required(),
  organization: organizationId
}).unknown().required().label('payInvoiceSchema')

exports.organizationAllowed = Joi.object({
  id: Joi.number().required(),
  githubId: Joi.number().required()
}).unknown().required().label('organizationAllowedSchema')
