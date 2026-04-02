/**
 * @description We strive to align with the JSON Schema specification
 * @see https://json-schema.org/specification
 */
export interface Schema {
  /**
   * @description The unique identifier for the schema
   * @see https://json-schema.org/understanding-json-schema/basics#declaring-a-unique-identifier
  */
  $id: string;

  /**
  * TODO: Not in spec atm
  */
  source: string;

  /**
  * @description The title of the schema (required by JSON Schema)
  */
  title: string;

  /**
  * TODO: Not in spec atm (should be optional)
  */
  version: string;

  /**
  * @description The description of the schema
  */
  description: string;

  /**
  * @description The type of the schema (required by JSON Schema) MUST be 'object'
  */
  type: 'object';

  /**
  * @description The properties of the schema (required by JSON Schema)
  */
  properties: { [key: string]: Attribute };

  /**
  * @description Required properties for the schema
  * @see https://json-schema.org/draft/2020-12/json-schema-validation#section-6.5.3
  */
  required?: string[];


  recommended?: string[];

  /**
  * @description Complex properties expressed using a regex pattern
  * @example { '^statement(\\[[^\\]]+\\])?$': { type: 'string', description: 'Delegate statement per organization (e.g. statement[dao.eth])' } }
  * @example { '^conflict-of-interest(\\[[^\\]]+\\])?$': { type: 'string', description: 'Conflict of interest declaration per organization (e.g. conflict-of-interest[dao.eth])' } }
  * @see https://json-schema.org/understanding-json-schema/reference/object#patternProperties
  */
  patternProperties?: { [key: string]: Attribute };
}

export interface Attribute {
  type: string;

  /**
  * @description The description of the attribute
  */
  description: string;

  /**
  * @description An optional field specifying the format of the attribute
  * @see https://www.learnjsonschema.com/2020-12/format-assertion/format/
  */
  format?: string;

/**
 * @description An optional field specifying the default value to be used if non is provided by the end user
 */
  default?: string;

  /**
   * @description An optional field specifying example values to be shown to the end user to help them understand the expected format of the attribute
   */
  examples?: string[];

  /**
   * @description An optional field specifying whether the attribute should be inherited from parent nodes
   */
  inherit?: boolean;

  /**
   * @description An optional field specifying the allowed values for the attribute
   * @example { enum: ['Active', 'Development', 'Deprecated'] }
   * @see https://json-schema.org/understanding-json-schema/reference/enum
   */
  enum?: string[];

  /**
  * @description An optional field specifying which type of record to request from the resolver (text() or data())
  */
  recordType?: 'text' | 'data';

  /**
   * @description An optional field specifying the type of parameter to expect when it is a parameterized key
   */
  parameterType?: 'map' | 'array';
}
