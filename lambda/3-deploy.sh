aws cloudformation package --template-file template.yml --s3-bucket magic-studio-libs --output-template-file out.yml
sleep 5
aws cloudformation deploy --template-file out.yml --stack-name magic-studio-java --capabilities CAPABILITY_NAMED_IAM