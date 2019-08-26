# app-webserver test/app

## Usage

### Run

Auto detect the port:

```
export DEVEBOT_SANDBOX=autoport
```

Start the server:

```shell
export DEBUG=devebot*,app*
export LOGOLITE_DEBUGLOG_ENABLED=true
node test/example
```

```curl
curl http://0.0.0.0:7979/example/1234567890
```

## Notes

### Certificate authentication

#### Client Side Certificate Auth in Nginx

Configuring nginx

```
server {
  listen 8443;
  ssl on;
  server_name node-protected-app;
  #Classic part of ssl
  ssl_certificate      /var/www/server.crt;
  ssl_certificate_key  /var/www/server.key;
  #Here we say that we trust clients that have signed their certificate with the CA certificate.
  ssl_client_certificate /var/www/ca.crt;
  #We can choose here if we allow only authenticated requests or not. In our case it's optional
  ssl_verify_client optional;

  location / {
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;

    #If the client certificate was verified against our CA the header VERIFIED
    #will have the value of 'SUCCESS' and 'NONE' otherwise
    proxy_set_header VERIFIED $ssl_client_verify;
    #If you want to get the DN information in your headers
    proxy_set_header DN $ssl_client_s_dn;

    proxy_pass http://127.0.0.1:3000;
  }
}
```

We specify the CA cert that we used to sign our client certificates (ca.crt) We set the ssl_verify_client to optional. This tells nginx to attempt to verify to SSL certificate if provided.

First, we pass in the $ssl_client_verify variable as the VERIFIED parameter. This is useful when we are allowing authenticated and unauthenticated requests. When the client certificate was able to be verified against our CA cert, this will have the value of SUCCESS. Otherwise, the value will be NONE.

Second, you'll notice we pass the $ssl_client_s_dn variable to the DN parameter. This will provide "the line subject DN of client certificate for established SSL-connection". The Common Name part of this certificate may be of most interest for you. Here is an example value for DN...

```
/C=US/ST=Florida/L=Orlando/O=CLIENT NAME/CN=CLIENT NAME
```

Nginx also provides the option to pass in the entire client certificate via $ssl_client_cert or $ssl_client_cert_raw. For more details on the SSL options available to you in nginx, checkout the Nginx Http SSL Module Wiki.
