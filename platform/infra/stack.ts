import { CfnOutput, Duration, RemovalPolicy, SecretValue, Stack, type StackProps } from 'aws-cdk-lib';
import type { Construct } from 'constructs';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cf from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as r53targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as secrets from 'aws-cdk-lib/aws-secretsmanager';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export type WaxRoomProps = StackProps & {
  domain: string;
  /** Route 53 zone for the domain, if it's there: records are then created automatically. */
  hostedZoneId?: string;
  /** An existing us-east-1 certificate covering domain, www and staff. Otherwise one is requested. */
  certificateArn?: string;
  /** Put the real domain names on the distributions (the cutover step). Off: test on *.cloudfront.net first. */
  attachDomains: boolean;
};

export class WaxRoomStack extends Stack {
  constructor(scope: Construct, id: string, props: WaxRoomProps) {
    super(scope, id, props);
    const { domain } = props;
    const www = `www.${domain}`;
    const staffHost = `staff.${domain}`;

    // ── data and keys ──
    const table = new dynamodb.Table(this, 'Data', {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    // Filled in by hand in the AWS console (or CLI) when the keys exist; nothing secret lives in the code.
    const appSecret = new secrets.Secret(this, 'AppKeys', {
      description: 'The Wax Room: session secret, owner login, Stripe and Twilio keys',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          OWNER_EMAIL: 'waxroomrichmond@gmail.com',
          OWNER_PASSWORD: '',
          STRIPE_SECRET_KEY: '',
          STRIPE_PUBLISHABLE_KEY: '',
          STRIPE_WEBHOOK_SECRET: '',
          TWILIO_ACCOUNT_SID: '',
          TWILIO_AUTH_TOKEN: '',
          TWILIO_MESSAGING_SERVICE_SID: '',
        }),
        generateStringKey: 'SESSION_SECRET',
        passwordLength: 48,
        excludePunctuation: true,
      },
      removalPolicy: RemovalPolicy.RETAIN,
    });
    void SecretValue;

    // ── API ──
    const fnProps = {
      entry: resolve(root, 'platform/api/src/lambda.ts'),
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 512,
      bundling: {
        format: OutputFormat.ESM,
        target: 'node22',
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        // bundle the AWS SDK too, rather than rely on the copy (and version) the Lambda runtime ships
        externalModules: [],
      },
      environment: {
        TABLE_NAME: table.tableName,
        APP_SECRET_ARN: appSecret.secretArn,
        SITE_URL: `https://${www}`,
        STAFF_URL: `https://${staffHost}`,
        NODE_ENV: 'production',
      },
    };
    const api = new NodejsFunction(this, 'Api', { ...fnProps, handler: 'api', timeout: Duration.seconds(20) });
    const tick = new NodejsFunction(this, 'Texts', { ...fnProps, handler: 'tick', timeout: Duration.minutes(2) });
    for (const fn of [api, tick]) {
      table.grantReadWriteData(fn);
      appSecret.grantRead(fn);
    }
    new events.Rule(this, 'EveryFifteenMinutes', { schedule: events.Schedule.rate(Duration.minutes(15)), targets: [new targets.LambdaFunction(tick)] });
    const apiUrl = api.addFunctionUrl({ authType: lambda.FunctionUrlAuthType.NONE });
    const apiOrigin = new origins.FunctionUrlOrigin(apiUrl);
    const apiBehavior: cf.BehaviorOptions = {
      origin: apiOrigin,
      allowedMethods: cf.AllowedMethods.ALLOW_ALL,
      cachePolicy: cf.CachePolicy.CACHING_DISABLED,
      originRequestPolicy: cf.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    };

    // ── certificate and DNS ──
    const zone = props.hostedZoneId ? route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', { hostedZoneId: props.hostedZoneId, zoneName: domain }) : undefined;
    let cert: acm.ICertificate | undefined;
    if (props.attachDomains) {
      cert = props.certificateArn
        ? acm.Certificate.fromCertificateArn(this, 'Cert', props.certificateArn)
        : new acm.Certificate(this, 'Cert', {
            domainName: domain,
            subjectAlternativeNames: [www, staffHost],
            validation: zone ? acm.CertificateValidation.fromDns(zone) : acm.CertificateValidation.fromDns(),
          });
    }

    // ── website ──
    const siteBucket = new s3.Bucket(this, 'Site', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true, removalPolicy: RemovalPolicy.RETAIN });
    // /services/brows/ → /services/brows/index.html; every /r/CODE referral link → /r/index.html;
    // the bare domain → www.
    const rewrite = new cf.Function(this, 'SitePaths', {
      runtime: cf.FunctionRuntime.JS_2_0,
      code: cf.FunctionCode.fromInline(`
function handler(event) {
  var req = event.request;
  var host = req.headers.host && req.headers.host.value;
  if (host === '${domain}') {
    return { statusCode: 301, statusDescription: 'Moved', headers: { location: { value: 'https://${www}' + req.uri } } };
  }
  var uri = req.uri;
  if (/^\\/r\\/[A-Za-z0-9]+\\/?$/.test(uri)) req.uri = '/r/index.html';
  else if (uri.endsWith('/')) req.uri = uri + 'index.html';
  else if (!uri.split('/').pop().includes('.')) req.uri = uri + '/index.html';
  return req;
}`),
    });
    const site = new cf.Distribution(this, 'SiteCdn', {
      comment: 'The Wax Room website',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [{ function: rewrite, eventType: cf.FunctionEventType.VIEWER_REQUEST }],
        cachePolicy: cf.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
      },
      additionalBehaviors: { '/api/*': apiBehavior },
      errorResponses: [{ httpStatus: 404, responsePagePath: '/404/index.html', responseHttpStatus: 404, ttl: Duration.minutes(5) }, { httpStatus: 403, responsePagePath: '/404/index.html', responseHttpStatus: 404, ttl: Duration.minutes(5) }],
      domainNames: cert ? [domain, www] : undefined,
      certificate: cert,
      priceClass: cf.PriceClass.PRICE_CLASS_100,
    });

    // ── staff dashboard (one-page app) ──
    const staffBucket = new s3.Bucket(this, 'Staff', { blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, enforceSSL: true, removalPolicy: RemovalPolicy.RETAIN });
    const staff = new cf.Distribution(this, 'StaffCdn', {
      comment: 'The Wax Room staff dashboard',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(staffBucket),
        viewerProtocolPolicy: cf.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cf.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: new cf.ResponseHeadersPolicy(this, 'StaffHeaders', {
          customHeadersBehavior: { customHeaders: [{ header: 'X-Robots-Tag', value: 'noindex, nofollow', override: true }] },
          securityHeadersBehavior: {
            frameOptions: { frameOption: cf.HeadersFrameOption.DENY, override: true },
            strictTransportSecurity: { accessControlMaxAge: Duration.days(365), includeSubdomains: true, override: true },
            contentTypeOptions: { override: true },
          },
        }),
      },
      additionalBehaviors: { '/api/*': apiBehavior },
      defaultRootObject: 'index.html',
      errorResponses: [
        { httpStatus: 403, responsePagePath: '/index.html', responseHttpStatus: 200 },
        { httpStatus: 404, responsePagePath: '/index.html', responseHttpStatus: 200 },
      ],
      domainNames: cert ? [staffHost] : undefined,
      certificate: cert,
      priceClass: cf.PriceClass.PRICE_CLASS_100,
    });

    // ── files (built before deploying) ──
    const siteDist = resolve(root, 'dist');
    // Until Twilio's registration is approved, the live site books through GlossGenius.
    // Deploying our own booking takes an explicit -c booking=native.
    const built = existsSync(resolve(siteDist, 'booking-mode.json')) ? JSON.parse(readFileSync(resolve(siteDist, 'booking-mode.json'), 'utf8')).booking : 'glossgenius';
    if (built !== (this.node.tryGetContext('booking') ?? 'glossgenius'))
      throw new Error(`dist/ was built with ${built} booking. Run \`npm run build\` (GlossGenius) or deploy with -c booking=native on purpose.`);
    const staffDist = resolve(root, 'dist-dashboard');
    if (existsSync(siteDist)) {
      // Hashed build files never change under the same name: cache them for a year, and keep
      // old ones (prune: false) for pages still open from before a deploy.
      const assets = new s3deploy.BucketDeployment(this, 'SiteAssets', {
        sources: [s3deploy.Source.asset(siteDist)],
        destinationBucket: siteBucket,
        exclude: ['*'],
        include: ['assets/*'],
        prune: false,
        cacheControl: [s3deploy.CacheControl.fromString('public, max-age=31536000, immutable')],
        memoryLimit: 1024,
      });
      // Pages, videos and images keep their names between deploys: browsers re-check them on
      // every visit (a 304 when unchanged), so a deploy, like the booking switch, shows at once.
      const pages = new s3deploy.BucketDeployment(this, 'SiteFiles', {
        sources: [s3deploy.Source.asset(siteDist)],
        destinationBucket: siteBucket,
        exclude: ['assets/*'],
        cacheControl: [s3deploy.CacheControl.fromString('public, max-age=0, must-revalidate')],
        distribution: site,
        distributionPaths: ['/*'],
        memoryLimit: 1024,
      });
      // new pages go live only after the files they load are there
      pages.node.addDependency(assets);
    }
    if (existsSync(staffDist))
      new s3deploy.BucketDeployment(this, 'StaffFiles', { sources: [s3deploy.Source.asset(staffDist)], destinationBucket: staffBucket, distribution: staff, distributionPaths: ['/*'] });

    if (zone && props.attachDomains) {
      for (const [id, name, dist] of [['Apex', domain, site], ['Www', www, site], ['StaffHost', staffHost, staff]] as const) {
        new route53.ARecord(this, `${id}A`, { zone, recordName: name, target: route53.RecordTarget.fromAlias(new r53targets.CloudFrontTarget(dist)) });
        new route53.AaaaRecord(this, `${id}Aaaa`, { zone, recordName: name, target: route53.RecordTarget.fromAlias(new r53targets.CloudFrontTarget(dist)) });
      }
    }

    new CfnOutput(this, 'SiteUrl', { value: props.attachDomains ? `https://${www}` : `https://${site.distributionDomainName}` });
    new CfnOutput(this, 'StaffUrl', { value: props.attachDomains ? `https://${staffHost}` : `https://${staff.distributionDomainName}` });
    new CfnOutput(this, 'KeysSecret', { value: appSecret.secretName, description: 'Add Stripe and Twilio keys here' });
    new CfnOutput(this, 'TwilioWebhook', { value: `https://${props.attachDomains ? www : site.distributionDomainName}/api/webhooks/twilio` });
    new CfnOutput(this, 'StripeWebhook', { value: `https://${props.attachDomains ? www : site.distributionDomainName}/api/webhooks/stripe` });
  }
}
